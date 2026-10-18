#!/usr/bin/env python3
"""Step 9 - assemble the website's data from the knowledge base and the photo pool.

Reads
  data/kb/*.json        species knowledge base (hand written, one array per file)
  data/kb/_pairs.json   hand-written "how to tell A from B" notes + sets of look-alikes
                        that can not be told apart from a photo (never asked together)
  pool.json             candidate photos (step 5)
  work/                 processed images (step 6), metrics.jsonl (step 6), scores.jsonl (step 7)
  rejects.json          optional: photo ids rejected after looking at them

and writes
  images/<species-id>/<photo-id>.avif   the selected photos
  images/thumbs/<species-id>.avif       a small cover picture per species
  data/species.js, data/photos.js       what the web app loads
  data/catalog.csv                      the same information as a plain table

Usage:
  09_build_data.py --repo . --pool pool.json --work work/ [--rejects rejects.json]
                   [--max-per-species 60] [--min-per-species 6] [--min-snake 0.2]
                   [--commercial-ok]       # keep only CC0 / CC-BY / CC-BY-SA photos
"""
import argparse
import csv
import datetime
import glob
import io
import json
import math
import os
import shutil
import sys
from collections import Counter, defaultdict

from PIL import Image

ENUMS = {
    "venom": {"deadly", "venomous", "mild", "none"},
}
REQUIRED = ["id", "sci", "name", "family", "kind", "tier", "venom", "len", "habitat", "range", "diet", "active", "ids", "look", "t", "grp"]
LOOK_KEYS = {"colour", "pattern", "head", "body"}
T_ENUMS = {
    "head": {"distinct", "indistinct", "flat", "pointed"},
    "snout": {"blunt", "pointed", "upturned", "wedge"},
    "pupil": {"round", "vertical", "keyhole"},
    "scales": {"smooth", "glossy", "keeled"},
    "habit": {"terrestrial", "arboreal", "semi-arboreal", "aquatic", "fossorial", "marine"},
    "build": {"thin", "slender", "medium", "stout", "heavy", "worm"},
    "pat": {"plain", "banded", "blotched", "striped", "spotted", "checkered", "reticulate", "speckled", "ringed", "chain", "bicolour"},
}
HUES = {"black", "brown", "grey", "green", "yellow", "red", "orange", "blue", "white", "olive", "pink", "cream", "silver", "tan"}
COMMERCIAL_OK = {"CC0", "CC-BY", "CC-BY-SA"}
EXT_CODE = {"jpg": 0, "jpeg": 1, "png": 2}


def load_kb(kb_dir):
    species, seen = [], set()
    for path in sorted(glob.glob(os.path.join(kb_dir, "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        for sp in json.load(open(path)):
            sp["_file"] = os.path.basename(path)
            if sp["id"] in seen:
                sys.exit(f"duplicate species id {sp['id']} in {path}")
            seen.add(sp["id"])
            species.append(sp)
    return species


def validate_species(sp):
    problems = []
    for k in REQUIRED:
        if k not in sp:
            problems.append(f"missing '{k}'")
    if sp.get("venom") not in ENUMS["venom"]:
        problems.append(f"bad venom {sp.get('venom')}")
    if not isinstance(sp.get("tier"), int) or not 1 <= sp["tier"] <= 5:
        problems.append("tier must be 1..5")
    if not 2 <= len(sp.get("ids", [])) <= 7:
        problems.append("ids should have 2..7 entries")
    if set(sp.get("look", {})) - LOOK_KEYS:
        problems.append(f"unknown look keys {set(sp['look']) - LOOK_KEYS}")
    t = sp.get("t", {})
    for k, allowed in T_ENUMS.items():
        if k in t and t[k] not in allowed:
            problems.append(f"t.{k}={t[k]!r} not in {sorted(allowed)}")
    if "size" in t and t["size"] not in (1, 2, 3, 4, 5):
        problems.append("t.size must be 1..5")
    if "hue" in t and not set(t["hue"]) <= HUES:
        problems.append(f"bad hue {set(t['hue']) - HUES}")
    return problems


def credit_for(p):
    name, login = (p.get("name") or "").strip(), (p.get("login") or "").strip()
    if name and login:
        return f"{name} (@{login})"
    return name or (f"@{login}" if login else "Unknown photographer")


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pool", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--rejects")
    ap.add_argument("--hard", help="JSON list of photo ids that are identifiable but difficult (kept, flagged hard)")
    ap.add_argument("--reviewed", help="JSON list of photo ids a person has looked at")
    ap.add_argument("--quality", help="work/quality.jsonl from step 7c (predicted quality for photos nobody has reviewed)")
    ap.add_argument("--unreviewed-keep", type=float, default=0.5, help="min predicted P(keep) for an unreviewed photo")
    ap.add_argument("--fill-below", type=int, default=14, help="use unreviewed photos only for species with fewer reviewed keepers")
    ap.add_argument("--max-per-species", type=int, default=60)
    ap.add_argument("--min-per-species", type=int, default=6)
    ap.add_argument("--min-snake", type=float, default=0.2, help="min ImageNet snake probability (step 7)")
    ap.add_argument("--min-sharp", type=float, default=120)
    ap.add_argument("--commercial-ok", action="store_true")
    ap.add_argument("--no-write", action="store_true", help="only report what would be built")
    args = ap.parse_args()

    kb = load_kb(os.path.join(args.repo, "data", "kb"))
    errors = {sp["id"]: validate_species(sp) for sp in kb}
    errors = {k: v for k, v in errors.items() if v}
    if errors:
        for k, v in errors.items():
            print(f"KB problem in {k}: {'; '.join(v)}", file=sys.stderr)
        sys.exit(1)
    pairs_meta = json.load(open(os.path.join(args.repo, "data", "kb", "_pairs.json")))
    ids = {sp["id"] for sp in kb}
    for p in pairs_meta.get("pairs", []):
        for k in ("a", "b"):
            if p[k] not in ids:
                sys.exit(f"pair note refers to unknown species {p[k]}")
    for group in pairs_meta.get("noPair", []):
        for sid in group:
            if sid not in ids:
                sys.exit(f"noPair refers to unknown species {sid}")

    rejects = set(json.load(open(args.rejects))) if args.rejects and os.path.exists(args.rejects) else set()
    hard = set(json.load(open(args.hard))) if args.hard and os.path.exists(args.hard) else set()
    reviewed = set(json.load(open(args.reviewed))) if args.reviewed and os.path.exists(args.reviewed) else set()
    predicted = {}
    if args.quality and os.path.exists(args.quality):
        for line in open(args.quality):
            q = json.loads(line)
            predicted[q["photo"]] = q
    metrics = {}
    for line in open(os.path.join(args.work, "metrics.jsonl")):
        m = json.loads(line)
        metrics[m["photo"]] = m
    scores = {}
    sp_path = os.path.join(args.work, "scores.jsonl")
    if os.path.exists(sp_path):
        for line in open(sp_path):
            s = json.loads(line)
            scores[s["photo"]] = s

    pool = json.load(open(args.pool))
    by_inat = defaultdict(list)
    for p in pool:
        by_inat[p["species"]].append(p)

    chosen_by_species, dropped = {}, []
    used_inat = set()
    for sp in kb:
        names = sp.get("inat") or [sp["sci"]]
        used_inat.update(names)
        cands, fallback = [], []
        for n in names:
            for p in by_inat.get(n, []):
                pid = p["photo"]
                if pid in rejects or pid not in metrics or p["license"] not in (COMMERCIAL_OK if args.commercial_ok else {"CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA"}):
                    continue
                snake = scores.get(pid, {}).get("snake", 1.0)
                if snake < args.min_snake or metrics[pid]["sharp"] < args.min_sharp:
                    continue
                # quality score: prominence of the snake, sharpness (log), resolution, primary photo
                q = 2.2 * snake + 0.35 * min(math.log10(max(metrics[pid]["sharp"], 10)) / 4, 1) + (0.15 if p["pos"] == 0 else 0)
                if reviewed and pid not in reviewed:
                    # nobody has looked at this photo: only usable if the model thinks it is fine
                    k = predicted.get(pid, {}).get("keep", 0)
                    if k >= args.unreviewed_keep:
                        fallback.append((q + k, p))
                    continue
                p["_hard"] = 1 if pid in hard else 0
                cands.append((q - (0.6 if p["_hard"] else 0), p))
        if len(cands) < args.fill_below:
            for q, p in sorted(fallback, key=lambda x: -x[0]):
                p["_hard"] = 1
                cands.append((q - 0.6, p))
        cands.sort(key=lambda x: -x[0])
        keep, hashes, per_observer = [], [], Counter()
        for q, p in cands:
            h = metrics[p["photo"]]["dhash"]
            if any(hamming(h, x) <= 4 for x in hashes):
                continue
            if per_observer[p["observer_id"]] >= 4:
                continue
            per_observer[p["observer_id"]] += 1
            hashes.append(h)
            keep.append(p)
            if len(keep) >= args.max_per_species:
                break
        if len(keep) < args.min_per_species:
            dropped.append((sp["id"], len(keep)))
            continue
        chosen_by_species[sp["id"]] = keep

    kept_species = [sp for sp in kb if sp["id"] in chosen_by_species]
    kept_species.sort(key=lambda s: s["name"].lower())
    total = sum(len(v) for v in chosen_by_species.values())
    print(f"{len(kept_species)} species, {total:,} photos")
    if dropped:
        print("dropped (too few usable photos):", ", ".join(f"{i} ({n})" for i, n in dropped))
    unused = sorted(set(by_inat) - used_inat)
    print(f"{len(unused)} pool species not covered by the knowledge base")
    if args.no_write:
        return

    repo = args.repo
    img_root = os.path.join(repo, "images")
    if os.path.isdir(img_root):
        shutil.rmtree(img_root)
    os.makedirs(os.path.join(img_root, "thumbs"))

    states, licenses, credits, inat_names = [], [], [], []
    idx = lambda lst, v: lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)
    rows, species_out, catalog = [], [], []
    for sp_index, sp in enumerate(kept_species):
        photos = chosen_by_species[sp["id"]]
        os.makedirs(os.path.join(img_root, sp["id"]), exist_ok=True)
        state_count = Counter()
        best = max(photos, key=lambda p: 2.2 * scores.get(p["photo"], {}).get("snake", 1.0) + 0.3 * min(math.log10(max(metrics[p["photo"]]["sharp"], 10)) / 4, 1) - 1.5 * p.get("_hard", 0) + 0.4 * (p["w"] >= p["h"]))
        cover = sp.get("cover") or best["photo"]
        for p in photos:
            src = os.path.join(args.work, "img", f"{p['photo']}.avif")
            shutil.copyfile(src, os.path.join(img_root, sp["id"], f"{p['photo']}.avif"))
            state_count[p["state"]] += 1
            inat = p["species"] if (sp.get("inat") and len(sp["inat"]) > 1) else ""
            rows.append([
                p["photo"], sp_index, idx(states, p["state"]) if p["state"] else -1, idx(credits, credit_for(p)),
                idx(licenses, p["license"]), metrics[p["photo"]]["w2"], metrics[p["photo"]]["h2"],
                idx(inat_names, inat) if inat else -1, EXT_CODE.get(p["ext"], 0), p.get("_hard", 0),
            ])
            catalog.append([p["photo"], sp["id"], sp["name"], sp["sci"], p["species"], p["state"], credit_for(p), p["license"],
                            f"https://www.inaturalist.org/photos/{p['photo']}"])
        # cover thumbnail
        im = Image.open(os.path.join(args.work, "img", f"{cover}.avif")).convert("RGB")
        im.thumbnail((360, 360), Image.LANCZOS)
        im.save(os.path.join(img_root, "thumbs", f"{sp['id']}.avif"), "AVIF", quality=48, speed=6)
        entry = {k: v for k, v in sp.items() if not k.startswith("_") and k not in ("inat", "cover")}
        entry["cover"] = cover
        entry["states"] = [[idx(states, s), n] for s, n in state_count.most_common() if s]
        species_out.append(entry)

    meta = {
        "generated": datetime.date.today().isoformat(), "version": 1,
        "photos": total, "species": len(kept_species),
        "source": "iNaturalist open data (research-grade observations, Creative Commons licences)",
    }
    species_js = {"meta": meta, "noPair": pairs_meta.get("noPair", []), "pairs": pairs_meta.get("pairs", []), "species": species_out}
    data_dir = os.path.join(repo, "data")
    with open(os.path.join(data_dir, "species.js"), "w") as fh:
        fh.write("/* Generated by scripts/dataset/09_build_data.py - do not edit by hand. */\nwindow.SQ_SPECIES = ")
        json.dump(species_js, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    with open(os.path.join(data_dir, "photos.js"), "w") as fh:
        fh.write("/* Generated by scripts/dataset/09_build_data.py - do not edit by hand. */\nwindow.SQ_PHOTOS = ")
        json.dump({"states": states, "licenses": licenses, "credits": credits, "inat": inat_names, "rows": rows}, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    with open(os.path.join(data_dir, "catalog.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["photo_id", "species_id", "common_name", "scientific_name", "inaturalist_taxon", "state", "photographer", "license", "source_url"])
        w.writerows(sorted(catalog, key=lambda r: (r[1], r[0])))
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(img_root) for f in fs)
    print(f"wrote {total:,} photos ({size / 1e6:.0f} MB), data/species.js, data/photos.js, data/catalog.csv")


if __name__ == "__main__":
    main()
