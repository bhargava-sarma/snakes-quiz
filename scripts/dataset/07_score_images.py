#!/usr/bin/env python3
"""Step 7 (quality filter) - score how prominently a snake appears in each photo.

A pretrained ImageNet classifier (ResNet-50 v2 from the ONNX model zoo) is run on
three views of every image (centre crop, whole frame, zoomed centre).  ImageNet has
17 snake classes (indices 52..68); the total probability on those classes is a
cheap, objective proxy for "a snake clearly fills the frame".  Photos where the
snake is a speck in the grass, a shed skin, a snake inside a jar, etc. score low.

Needs:  pip install onnxruntime pillow numpy
Model:  https://s3.amazonaws.com/onnx-model-zoo/resnet/resnet50v2/resnet50v2.onnx
Names:  https://s3.amazonaws.com/onnx-model-zoo/synset.txt

Usage: 07_score_images.py --work work/ --model resnet50v2.onnx --synset synset.txt
Writes work/scores.jsonl  (photo, snake, view scores, top-1 label)
"""
import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import onnxruntime as ort
from PIL import Image

SNAKE = slice(52, 69)
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def to_tensor(im):
    a = (np.asarray(im, dtype=np.float32) / 255.0 - MEAN) / STD
    return a.transpose(2, 0, 1)


def views(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    # A: classic resize(256)+centre-crop(224)
    s = 256 / min(w, h)
    a = im.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BILINEAR)
    left, top = (a.width - 224) // 2, (a.height - 224) // 2
    a = a.crop((left, top, left + 224, top + 224))
    # B: the whole frame squashed to a square
    b = im.resize((224, 224), Image.BILINEAR)
    # C: zoomed centre (55 %)
    cw, ch = int(w * 0.55), int(h * 0.55)
    c = im.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch)).resize((224, 224), Image.BILINEAR)
    return np.stack([to_tensor(a), to_tensor(b), to_tensor(c)])


def softmax(x):
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--synset", required=True)
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    names = [l.strip().split(" ", 1)[1].split(",")[0] for l in open(args.synset)]
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    sess = ort.InferenceSession(args.model, opts, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name

    img_dir = os.path.join(args.work, "img")
    out_path = os.path.join(args.work, "scores.jsonl")
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path):
            try:
                done.add(json.loads(line)["photo"])
            except Exception:
                pass
    files = sorted(f for f in os.listdir(img_dir) if f.endswith(".avif") and int(f[:-5]) not in done)
    print(f"{len(files)} images to score ({len(done)} already done)", flush=True)

    t0 = time.time()
    with open(out_path, "a") as out, ThreadPoolExecutor(3) as ex:
        batches = [files[i:i + 8] for i in range(0, len(files), 8)]
        loader = lambda b: [views(os.path.join(img_dir, f)) for f in b]
        pending = ex.submit(loader, batches[0]) if batches else None
        for bi, batch in enumerate(batches):
            data = pending.result()
            pending = ex.submit(loader, batches[bi + 1]) if bi + 1 < len(batches) else None
            x = np.concatenate(data).astype(np.float32)
            # the zoo model has a fixed batch size of 1, so run the views one by one
            probs = softmax(np.concatenate([sess.run(None, {inp: x[j:j + 1]})[0] for j in range(len(x))]))
            for i, f in enumerate(batch):
                p = probs[3 * i:3 * i + 3]
                mass = p[:, SNAKE].sum(axis=1)
                top = int(p[0].argmax())
                out.write(json.dumps({
                    "photo": int(f[:-5]), "snake": round(float(mass.max()), 4),
                    "center": round(float(mass[0]), 4), "full": round(float(mass[1]), 4), "zoom": round(float(mass[2]), 4),
                    "top1": names[top], "top1p": round(float(p[0][top]), 3),
                }) + "\n")
            out.flush()
            if (bi + 1) % 50 == 0:
                done_n = (bi + 1) * 8
                rate = done_n / (time.time() - t0)
                print(f"  {done_n}/{len(files)}  {rate:.1f}/s  eta {(len(files) - done_n) / rate / 60:.1f} min", flush=True)
    print("done")


if __name__ == "__main__":
    main()
