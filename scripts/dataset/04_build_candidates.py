#!/usr/bin/env python3
"""Step 4 - join observations, photos and observers into candidate images.

For every research-grade snake observation in the subcontinent we work out
whether it was made inside India (and in which state / union territory) by
testing the GPS point against state polygons.

The polygons are only used at build time to *label* each photo with a state; the
map file itself is not redistributed.  Any GeoJSON FeatureCollection with a
`properties.name` per state works, e.g. from the npm package
`@highcharts/map-collection` (countries/in/in-all.geo.json, OpenStreetMap data).

Usage:
  04_build_candidates.py --obs obs_snakes.tsv --photos photos_snakes.tsv \
      --observers observers.csv.gz --taxa snake_taxa.tsv \
      --states in-all.geo.json --out candidates.jsonl
"""
import argparse
import csv
import gzip
import json
from collections import Counter

import numpy as np
import shapely
from shapely.geometry import shape

# The islands are tiny and the polygons are coarse, so allow a generous snap
# distance (degrees) for them.  Mainland states only snap by a few km, so a
# photo from just across the border (Nepal, Bangladesh...) is not claimed.
ISLAND_STATES = {"Andaman and Nicobar Islands", "Lakshadweep"}
SNAP_MAINLAND_DEG = 0.06
SNAP_ISLAND_DEG = 0.5


def load_states(path):
    with open(path) as fh:
        data = json.load(fh)
    return [(f["properties"]["name"], shape(f["geometry"])) for f in data["features"]]


def locate(lats, lons, states):
    """Return a list with the state name for every point, or None if outside India."""
    x, y = np.asarray(lons, dtype=float), np.asarray(lats, dtype=float)
    result = [None] * len(x)
    todo = np.ones(len(x), dtype=bool)
    for name, geom in states:
        hit = shapely.contains_xy(geom, x, y) & todo
        for i in np.flatnonzero(hit):
            result[i] = name
        todo &= ~hit
    # snap points that fall just outside the (coarse) polygons
    idx = np.flatnonzero(todo)
    if len(idx):
        pts = shapely.points(x[idx], y[idx])
        best_d = np.full(len(idx), np.inf)
        best_n = [None] * len(idx)
        for name, geom in states:
            d = shapely.distance(geom, pts)
            limit = SNAP_ISLAND_DEG if name in ISLAND_STATES else SNAP_MAINLAND_DEG
            better = (d < best_d) & (d <= limit)
            for j in np.flatnonzero(better):
                best_d[j], best_n[j] = d[j], name
        for j, i in enumerate(idx):
            result[i] = best_n[j]
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--obs", required=True)
    ap.add_argument("--photos", required=True)
    ap.add_argument("--observers", required=True)
    ap.add_argument("--taxa", required=True, help="snake_taxa.tsv from step 1")
    ap.add_argument("--states", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    species_name = {}
    with open(args.taxa) as fh:
        for line in fh:
            _, sp, name = line.rstrip("\n").split("\t")
            species_name[sp] = name

    obs = {}
    with open(args.obs) as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            obs[f[0]] = {
                "observer": f[1], "lat": float(f[2]), "lon": float(f[3]),
                "acc": float(f[4]) if f[4] else None, "species": f[6], "date": f[7],
                "anomaly": float(f[8]) if len(f) > 8 and f[8] else None,
            }
    print(f"{len(obs):,} observations loaded")

    uuids = list(obs)
    states = locate([obs[u]["lat"] for u in uuids], [obs[u]["lon"] for u in uuids], load_states(args.states))
    for u, s in zip(uuids, states):
        obs[u]["state"] = s
    in_india = sum(1 for u in uuids if obs[u]["state"])
    print(f"{in_india:,} observations fall inside India")

    wanted = {obs[u]["observer"] for u in uuids if obs[u]["state"]}
    observers = {}
    with gzip.open(args.observers, "rt", newline="") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            if row["observer_id"] in wanted:
                observers[row["observer_id"]] = (row["login"], row["name"])

    n = 0
    per_species = Counter()
    with open(args.photos) as fh, open(args.out, "w") as out:
        for line in fh:
            pid, ouuid, ext, lic, w, h, pos = line.rstrip("\n").split("\t")
            o = obs.get(ouuid)
            if not o or not o["state"]:
                continue
            login, name = observers.get(o["observer"], ("", ""))
            out.write(json.dumps({
                "photo": int(pid), "obs": ouuid, "ext": ext, "license": lic,
                "w": int(w), "h": int(h), "pos": int(pos),
                "species": species_name[o["species"]], "species_id": o["species"],
                "state": o["state"], "lat": o["lat"], "lon": o["lon"], "acc": o["acc"],
                "date": o["date"], "observer_id": o["observer"], "login": login,
                "name": name, "anomaly": o["anomaly"],
            }) + "\n")
            n += 1
            per_species[o["species"]] += 1
    print(f"{n:,} candidate photos written for {len(per_species)} species -> {args.out}")


if __name__ == "__main__":
    main()
