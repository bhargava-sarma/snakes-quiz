#!/usr/bin/env python3
"""Step 7c (optional) - learn "is this a good quiz photo?" from human labels.

Training data are photos a person looked at on contact sheets (08_contact_sheets.py):
  rejects.json   photos that are unusable (no snake visible, tiny speck, mangled, collage ...)
  hard.json      photos that are identifiable but difficult (small, dark, partly hidden)
  reviewed       every other photo on a reviewed sheet counts as "good"
A logistic regression on the ResNet embeddings (07b) predicts, for every photo,
  p_keep  = P(not a reject)         p_good = P(clear, easy photo | keep)
and writes work/quality.jsonl.  Re-run it after labelling more sheets.

Usage: 07c_rank_quality.py --work work/ --sheets sheets/ --rejects rejects.json --hard hard.json --reviewed review.log
"""
import argparse
import json
import os

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--sheets", required=True, nargs="+", help="one or more sheet directories")
    ap.add_argument("--rejects", required=True)
    ap.add_argument("--hard", required=True)
    ap.add_argument("--reviewed", required=True, help="review.log: one 'sheet-base: ...' line per reviewed sheet")
    ap.add_argument("--C", type=float, default=0.05)
    args = ap.parse_args()

    z = np.load(os.path.join(args.work, "embeddings.npz"))
    ids, X = z["ids"].tolist(), z["feats"]
    row = {pid: i for i, pid in enumerate(ids)}

    # extra scalar features (snake probability, sharpness, brightness, aspect)
    scores, metrics = {}, {}
    for line in open(os.path.join(args.work, "scores.jsonl")):
        d = json.loads(line)
        scores[d["photo"]] = d
    for line in open(os.path.join(args.work, "metrics.jsonl")):
        d = json.loads(line)
        metrics[d["photo"]] = d
    extra = np.array([[scores[p]["snake"], scores[p]["center"], scores[p]["full"], scores[p]["zoom"],
                       np.log10(max(metrics[p]["sharp"], 1)), metrics[p]["bright"] / 255, metrics[p]["contrast"] / 128,
                       metrics[p]["w2"] / metrics[p]["h2"], metrics[p]["bytes"] / 1e5] for p in ids], dtype=np.float32)
    X = np.hstack([X, extra * 3])
    X = StandardScaler().fit_transform(X)

    rejects = set(json.load(open(args.rejects)))
    hard = set(json.load(open(args.hard)))
    reviewed = set()
    for line in open(args.reviewed):
        base = line.split(":")[0]
        for d in args.sheets:
            path = os.path.join(d, base + ".json")
            if os.path.exists(path):
                reviewed.update(json.load(open(path)).values())
                break
    lab = [p for p in reviewed if p in row]
    y_keep = np.array([0 if p in rejects else 1 for p in lab])
    y_good = np.array([0 if p in hard else 1 for p in lab])
    idx = np.array([row[p] for p in lab])
    print(f"{len(lab)} labelled photos: {int((y_keep == 0).sum())} rejected, {int(((y_keep == 1) & (y_good == 0)).sum())} hard, {int(((y_keep == 1) & (y_good == 1)).sum())} good")

    cv = StratifiedKFold(5, shuffle=True, random_state=3)
    keep_clf = LogisticRegression(C=args.C, max_iter=4000, class_weight="balanced")
    cvp = cross_val_predict(keep_clf, X[idx], y_keep, cv=cv, method="predict_proba")[:, 1]
    print("keep-vs-reject  cross-validated AUC", round(roc_auc_score(y_keep, cvp), 3))
    order = np.argsort(-cvp)
    for frac in (0.4, 0.6, 0.8):
        k = int(frac * len(lab))
        print(f"   keeping the top {int(frac * 100)}%: {y_keep[order[:k]].mean() * 100:.0f}% are really keepers; {y_keep[order[:k]].sum() / y_keep.sum() * 100:.0f}% of all keepers retained")

    mask = y_keep == 1
    good_clf = LogisticRegression(C=args.C, max_iter=4000, class_weight="balanced")
    cvg = cross_val_predict(good_clf, X[idx][mask], y_good[mask], cv=cv, method="predict_proba")[:, 1]
    print("good-vs-hard    cross-validated AUC", round(roc_auc_score(y_good[mask], cvg), 3))

    keep_clf.fit(X[idx], y_keep)
    good_clf.fit(X[idx][mask], y_good[mask])
    p_keep = keep_clf.predict_proba(X)[:, 1]
    p_good = good_clf.predict_proba(X)[:, 1]
    # for labelled photos use out-of-fold predictions so they are not over-confident
    for j, i in enumerate(idx):
        p_keep[i] = cvp[j]
    with open(os.path.join(args.work, "quality.jsonl"), "w") as fh:
        for i, pid in enumerate(ids):
            fh.write(json.dumps({"photo": pid, "keep": round(float(p_keep[i]), 4), "good": round(float(p_good[i]), 4)}) + "\n")
    print("wrote", os.path.join(args.work, "quality.jsonl"))


if __name__ == "__main__":
    main()
