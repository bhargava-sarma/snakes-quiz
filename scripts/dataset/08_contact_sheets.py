#!/usr/bin/env python3
"""Make numbered contact sheets of the downloaded photos, one set per species,
so a person (or a vision model) can skim them and list the unsuitable shots.

Each tile carries its index (1..N within the species) and a sharpness score.
A JSON sidecar per sheet maps tile index -> photo id.

Usage: 08_contact_sheets.py --pool pool.json --work work/ --out sheets/ [--species "Naja naja"] [--cols 8 --rows 5]
"""
import argparse
import json
import os
import re
from collections import defaultdict

from PIL import Image, ImageDraw, ImageFont


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--species", action="append", help="only these species (repeatable)")
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--rows", type=int, default=5)
    ap.add_argument("--tile", type=int, default=190)
    ap.add_argument("--rejects", help="JSON list of photo ids to leave out")
    ap.add_argument("--min-snake", type=float, default=0.0, help="skip photos whose ImageNet snake score (step 7) is lower")
    ap.add_argument("--quality", help="work/quality.jsonl from 07c: rank each species' photos by predicted quality")
    ap.add_argument("--top", type=int, default=0, help="with --quality: only the N best-ranked photos per species")
    ap.add_argument("--skip-reviewed", help="review.log: leave out species whose sheets were already reviewed")
    ap.add_argument("--exclude-ids", help="JSON list of photo ids to leave out (e.g. photos already reviewed)")
    ap.add_argument("--prefix", default="", help="prefix for the sheet file names")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    rejects = set(json.load(open(args.rejects))) if args.rejects else set()
    metrics = {}
    with open(os.path.join(args.work, "metrics.jsonl")) as fh:
        for line in fh:
            m = json.loads(line)
            metrics[m["photo"]] = m

    scores = {}
    sp = os.path.join(args.work, "scores.jsonl")
    if os.path.exists(sp):
        for line in open(sp):
            d = json.loads(line)
            scores[d["photo"]] = d["snake"]

    excluded = set(json.load(open(args.exclude_ids))) if args.exclude_ids else set()
    quality = {}
    if args.quality:
        for line in open(args.quality):
            q = json.loads(line)
            quality[q["photo"]] = q

    by_species = defaultdict(list)
    for p in json.load(open(args.pool)):
        if p["photo"] in metrics and p["photo"] not in rejects and p["photo"] not in excluded and scores.get(p["photo"], 1.0) >= args.min_snake:
            by_species[p["species"]].append(p)

    if args.skip_reviewed:
        done = {l.split(":")[0].rsplit("-", 1)[0] for l in open(args.skip_reviewed)}
        by_species = {k: v for k, v in by_species.items() if slug(k) not in done}

    if quality:
        for sp, lst in by_species.items():
            lst.sort(key=lambda p: -(quality[p["photo"]]["keep"] * (0.7 + 0.3 * quality[p["photo"]]["good"])))
            if args.top:
                del lst[args.top:]

    tw, th = args.tile, int(args.tile * 0.75)
    font = ImageFont.load_default(size=15)
    small = ImageFont.load_default(size=12)
    per = args.cols * args.rows
    made = 0
    for species, photos in sorted(by_species.items()):
        if args.species and species not in args.species:
            continue
        if not quality:
            photos.sort(key=lambda p: p["photo"])
        pages = [photos[i:i + per] for i in range(0, len(photos), per)]
        for pi, chunk in enumerate(pages, 1):
            head = 26
            sheet = Image.new("RGB", (args.cols * (tw + 4) + 4, head + args.rows * (th + 4) + 4), (24, 24, 24))
            d = ImageDraw.Draw(sheet)
            d.text((6, 4), f"{species}  -  sheet {pi}/{len(pages)}  ({len(photos)} photos)", fill=(255, 255, 255), font=font)
            index = {}
            for i, p in enumerate(chunk):
                n = (pi - 1) * per + i + 1
                index[n] = p["photo"]
                x = 4 + (i % args.cols) * (tw + 4)
                y = head + (i // args.cols) * (th + 4)
                try:
                    im = Image.open(os.path.join(args.work, "img", f"{p['photo']}.avif")).convert("RGB")
                except Exception:
                    continue
                im.thumbnail((tw, th), Image.LANCZOS)
                tile = Image.new("RGB", (tw, th), (0, 0, 0))
                tile.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
                sheet.paste(tile, (x, y))
                label = str(n)
                d.rectangle([x, y, x + 8 + 9 * len(label), y + 19], fill=(0, 0, 0))
                d.text((x + 4, y + 1), label, fill=(255, 235, 90), font=font)
                s = metrics[p["photo"]]["sharp"]
                d.text((x + 3, y + th - 14), (f"k{int(100 * quality[p['photo']]['keep'])} g{int(100 * quality[p['photo']]['good'])}" if quality else f"s{int(s)} p{int(100 * scores.get(p['photo'], 1.0))}"), fill=(160, 230, 255), font=small)
            base = f"{args.prefix}{slug(species)}-{pi}"
            sheet.save(os.path.join(args.out, base + ".jpg"), quality=82)
            json.dump(index, open(os.path.join(args.out, base + ".json"), "w"))
            made += 1
    print(f"{made} sheets written to {args.out}")


if __name__ == "__main__":
    main()
