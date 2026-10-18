#!/usr/bin/env python3
"""Step 7b (optional) - image embeddings for a learned photo-quality filter.

Runs the same ResNet-50 v2 model as step 7 but keeps the 2048-d pooled feature vector
(the input of the final classifier layer).  Two views per image (centre crop and the
whole frame) are averaged.  The vectors are stored as work/embeddings.npz and are used
by 07c_rank_quality.py, which learns from a few thousand human "good / bad" labels which
photos make good quiz questions.

Usage: 07b_embed_images.py --work work/ --model resnet50v2.onnx
"""
import argparse
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import onnx
import onnxruntime as ort
from PIL import Image

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
FEATURE_NODE = "resnetv24_flatten0_reshape0"


def to_tensor(im):
    return ((np.asarray(im, dtype=np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1)


def views(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    s = 256 / min(w, h)
    a = im.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BILINEAR)
    left, top = (a.width - 224) // 2, (a.height - 224) // 2
    a = a.crop((left, top, left + 224, top + 224))
    b = im.resize((224, 224), Image.BILINEAR)
    return np.stack([to_tensor(a), to_tensor(b)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--threads", type=int, default=3)
    args = ap.parse_args()

    model = onnx.load(args.model)
    model.graph.output.append(onnx.helper.make_tensor_value_info(FEATURE_NODE, onnx.TensorProto.FLOAT, [1, 2048]))
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    sess = ort.InferenceSession(model.SerializeToString(), opts, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    out_names = [FEATURE_NODE]

    img_dir = os.path.join(args.work, "img")
    out_path = os.path.join(args.work, "embeddings.npz")
    ids, feats = [], []
    if os.path.exists(out_path):            # resume: keep what is already embedded
        old = np.load(out_path)
        ids, feats = old["ids"].tolist(), list(old["feats"])
    have = set(ids)
    files = sorted(f for f in os.listdir(img_dir) if f.endswith(".avif") and int(f[:-5]) not in have)
    print(f"{len(files)} new images to embed ({len(have)} already done)", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(2) as ex:
        loader = lambda f: views(os.path.join(img_dir, f))
        futures = [ex.submit(loader, f) for f in files[:16]]
        nxt = 16
        for i, f in enumerate(files):
            x = futures[i].result()
            futures[i] = None
            if nxt < len(files):
                futures.append(ex.submit(loader, files[nxt]))
                nxt += 1
            v = np.mean([sess.run(out_names, {inp: x[j:j + 1].astype(np.float32)})[0][0] for j in range(2)], axis=0)
            ids.append(int(f[:-5]))
            feats.append(v.astype(np.float32))
            if (i + 1) % 500 == 0:
                rate = (i + 1) / (time.time() - t0)
                print(f"  {i + 1}/{len(files)}  {rate:.1f}/s  eta {(len(files) - i - 1) / rate / 60:.1f} min", flush=True)
    np.savez_compressed(out_path, ids=np.array(ids), feats=np.stack(feats))
    print("done", len(ids))


if __name__ == "__main__":
    main()
