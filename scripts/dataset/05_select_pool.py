#!/usr/bin/env python3
"""Step 5 - choose a pool of candidate photos for every species.

Rules (all about getting good, varied, fair quiz photos):
  * licence must allow redistribution with modification (checked in step 3)
  * the original must be at least 800 px on its long side and 480 px on the
    short side, and not an extreme panorama
  * one photo per observation (the observation's primary photo, position 0);
    species with few observations may contribute up to three photos each
  * at most N photos per observer per species so one person's burst of the same
    snake does not dominate
  * a species needs a minimum number of distinct observations to be included

Usage: 05_select_pool.py --candidates candidates.jsonl --out pool.json
"""
import argparse
import json
import random
from collections import defaultdict

ALLOWED = {"CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-obs", type=int, default=5, help="min distinct observations per species")
    ap.add_argument("--pool", type=int, default=90, help="max photos kept per species in the pool")
    ap.add_argument("--per-observer", type=int, default=3)
    ap.add_argument("--few-obs", type=int, default=20, help="species with fewer observations may use extra photos per observation")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rnd = random.Random(args.seed)

    by_species = defaultdict(lambda: defaultdict(list))  # species -> obs -> photos
    for line in open(args.candidates):
        c = json.loads(line)
        if c["license"] not in ALLOWED:
            continue
        long_side, short_side = max(c["w"], c["h"]), min(c["w"], c["h"])
        if long_side < 800 or short_side < 480 or not 0.55 <= c["w"] / c["h"] <= 2.2:
            continue
        by_species[c["species"]][c["obs"]].append(c)

    pool, kept_species = [], 0
    for species, observations in sorted(by_species.items()):
        if len(observations) < args.min_obs:
            continue
        kept_species += 1
        extra = 3 if len(observations) < args.few_obs else 1
        cands = []
        for photos in observations.values():
            photos.sort(key=lambda p: p["pos"])
            for rank, p in enumerate(photos[:extra]):
                res = min(max(p["w"], p["h"]), 2400) / 2400
                p["score"] = (1.0 if rank == 0 else 0.0) + 0.4 * res + rnd.random() * 0.8
                cands.append(p)
        cands.sort(key=lambda p: -p["score"])
        per_observer, chosen = defaultdict(int), []
        for p in cands:
            if per_observer[p["observer_id"]] >= args.per_observer:
                continue
            per_observer[p["observer_id"]] += 1
            chosen.append(p)
            if len(chosen) >= args.pool:
                break
        pool.extend(chosen)

    keep = ("photo", "obs", "ext", "license", "w", "h", "pos", "species", "state", "lat", "lon",
            "acc", "date", "observer_id", "login", "name")
    json.dump([{k: p[k] for k in keep} for p in pool], open(args.out, "w"))
    print(f"{len(pool):,} photos in the pool across {kept_species} species -> {args.out}")


if __name__ == "__main__":
    main()
