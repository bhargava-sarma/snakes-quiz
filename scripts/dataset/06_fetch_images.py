#!/usr/bin/env python3
"""Step 6 - download the pool of photos and re-encode them for the web.

For each photo in pool.json this
  * downloads iNaturalist's 1024 px "large" derivative from the open-data bucket,
  * fixes orientation, strips all metadata, converts to sRGB,
  * downsizes to at most MAX_SIDE px and saves it as AVIF,
  * records quick quality metrics (sharpness, brightness, 64-bit dHash) so the
    final selection can drop blurry shots and near-duplicates.

It is resumable: photos that already have an output file and a metrics row are
skipped.

Usage: 06_fetch_images.py --pool pool.json --out work/ [--workers 24]
"""
import argparse
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
from PIL import Image, ImageOps

BASE = "https://inaturalist-open-data.s3.amazonaws.com/photos"
MAX_SIDE = 800
AVIF_QUALITY = 45
AVIF_SPEED = 6


def fetch(photo_id, ext):
    last = None
    for size in ("large", "medium", "original"):
        url = f"{BASE}/{photo_id}/{size}.{ext}"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                last = e
                if e.code in (403, 404):
                    break  # this size does not exist, try the next one
                time.sleep(1.5 * (attempt + 1))
            except Exception as e:  # network hiccup
                last = e
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"download failed for {photo_id}: {last}")


def metrics_for(img):
    g = img.convert("L")
    g.thumbnail((256, 256), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float32)
    lap = -4 * a[1:-1, 1:-1] + a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:]
    small = np.asarray(img.convert("L").resize((9, 8), Image.LANCZOS), dtype=np.float32)
    bits = (small[:, 1:] > small[:, :-1]).flatten()
    dhash = 0
    for b in bits:
        dhash = (dhash << 1) | int(b)
    return {
        "sharp": round(float(lap.var()), 1),
        "bright": round(float(a.mean()), 1),
        "contrast": round(float(a.std()), 1),
        "dhash": f"{dhash:016x}",
    }


def process(item, out_dir):
    pid = item["photo"]
    dest = os.path.join(out_dir, "img", f"{pid}.avif")
    raw = fetch(pid, item["ext"])
    im = Image.open(io.BytesIO(raw))
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB",):
        im = im.convert("RGB")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    m = metrics_for(im)
    buf = io.BytesIO()
    im.save(buf, "AVIF", quality=AVIF_QUALITY, speed=AVIF_SPEED)
    with open(dest, "wb") as fh:
        fh.write(buf.getvalue())
    m.update({"photo": pid, "w2": im.size[0], "h2": im.size[1], "bytes": len(buf.getvalue())})
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=24)
    args = ap.parse_args()

    os.makedirs(os.path.join(args.out, "img"), exist_ok=True)
    metrics_path = os.path.join(args.out, "metrics.jsonl")
    done = set()
    if os.path.exists(metrics_path):
        for line in open(metrics_path):
            try:
                done.add(json.loads(line)["photo"])
            except Exception:
                pass
    pool = json.load(open(args.pool))
    todo = [p for p in pool if p["photo"] not in done]
    print(f"{len(pool):,} in pool, {len(done):,} already done, {len(todo):,} to fetch", flush=True)

    lock, ok, failed = threading.Lock(), 0, []
    t0 = time.time()
    with open(metrics_path, "a") as mfh, ThreadPoolExecutor(args.workers) as ex:
        futures = {ex.submit(process, p, args.out): p for p in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                m = fut.result()
                with lock:
                    mfh.write(json.dumps(m) + "\n")
                    mfh.flush()
                ok += 1
            except Exception as e:
                failed.append((futures[fut]["photo"], str(e)))
            if i % 250 == 0:
                rate = i / (time.time() - t0)
                print(f"  {i:,}/{len(todo):,}  ({rate:.1f}/s, eta {(len(todo) - i) / rate / 60:.1f} min)", flush=True)
    print(f"done: {ok:,} ok, {len(failed)} failed")
    for pid, err in failed[:20]:
        print("  FAILED", pid, err, file=sys.stderr)


if __name__ == "__main__":
    main()
