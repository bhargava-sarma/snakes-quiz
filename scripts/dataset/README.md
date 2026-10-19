# Building the photo data set

The website's photos come from **iNaturalist's open data** (an Open Data programme on AWS; the metadata and
photos are public and need no account or API key). These scripts turn that firehose (about 250 million
observations) into the few thousand good, correctly-labelled snake photos the quiz uses.

You do **not** need to run any of this to use or deploy the site: the finished data set is already in
`images/` and `data/`. Run it when you want to regenerate, extend, or re-license the data set.

## Requirements

- Python 3.10+ with `pip install pillow numpy scipy shapely onnxruntime onnx scikit-learn`
- `curl`, `gunzip`, `mawk` (or `awk`)
- about 30 GB of free disk space and a fast connection (steps 2 and 3 stream ~34 GB; nothing large is kept)
- a polygon file of Indian states for step 4, e.g. `countries/in/in-all.geo.json` from the npm package
  `@highcharts/map-collection` (OpenStreetMap data). It is only used to *label* photos with a state and is not redistributed
- for the optional quality filter (steps 7, 7b): the ResNet-50 v2 ONNX model and class names from the ONNX model zoo

## The pipeline

| step | script | what it does |
| --- | --- | --- |
| 1 | `01_snake_taxa.py` | finds every snake taxon (suborder Serpentes) in `taxa.csv.gz` and maps sub-species to species |
| 2 | `02_filter_observations.sh` | streams `observations.csv.gz` (13 GB) and keeps research-grade snake observations in the Indian-subcontinent box |
| 3 | `03_filter_photos.sh` | streams `photos.csv.gz` (21 GB) and keeps the photos of those observations whose licence allows redistribution (no "ND") |
| 4 | `04_build_candidates.py` | joins observations, photos and photographers; keeps observations inside India and labels each with its state |
| 5 | `05_select_pool.py` | picks a candidate pool per species: size/aspect limits, one photo per observation, at most 3 per photographer |
| 6 | `06_fetch_images.py` | downloads each photo from the open-data bucket, re-encodes it as an 800 px AVIF (about 35 KB) and records sharpness and a perceptual hash |
| 7 | `07_score_images.py` | scores how prominently a snake appears (ImageNet snake classes, three views per photo) |
| 7b/7c | `07b_embed_images.py`, `07c_rank_quality.py` | optional: learns "is this a good quiz photo?" from your own good/hard/reject labels |
| 8 | `08_contact_sheets.py` | makes numbered contact sheets so a person can quickly mark unusable photos |
| 9 | `09_build_data.py` | combines the knowledge base (`data/kb`) with the chosen photos and writes `images/`, `data/species.js`, `data/photos.js`, `data/catalog.csv`, `CREDITS.md` |

```bash
W=work; mkdir -p $W/in && cd $W/in
B=https://inaturalist-open-data.s3.amazonaws.com
curl -O $B/taxa.csv.gz && curl -O $B/observers.csv.gz

python3 ../../scripts/dataset/01_snake_taxa.py taxa.csv.gz snake_taxa.tsv
../../scripts/dataset/02_filter_observations.sh snake_taxa.tsv obs_snakes.tsv        # ~10 min
curl -C - -O $B/photos.csv.gz                                                         # 21 GB, deleted afterwards
../../scripts/dataset/03_filter_photos.sh obs_snakes.tsv photos.csv.gz photos_snakes.tsv   # ~15 min
python3 ../../scripts/dataset/04_build_candidates.py --obs obs_snakes.tsv --photos photos_snakes.tsv \
    --observers observers.csv.gz --taxa snake_taxa.tsv --states in-all.geo.json --out candidates.jsonl
python3 ../../scripts/dataset/05_select_pool.py --candidates candidates.jsonl --out pool.json
python3 ../../scripts/dataset/06_fetch_images.py --pool pool.json --out ../out                # ~15 min
python3 ../../scripts/dataset/07_score_images.py --work ../out --model resnet50v2.onnx --synset synset.txt
python3 ../../scripts/dataset/09_build_data.py --repo ../.. --pool pool.json --work ../out --min-snake 0.9
```

### Human review (recommended)

Automatic filters are not perfect. For the shipped data set, a person looked at contact sheets and listed the
unusable photos (`rejects.json`) and the difficult-but-identifiable ones (`hard.json`):

```bash
python3 scripts/dataset/08_contact_sheets.py --pool pool.json --work out --out sheets --min-snake 0.9
# look at sheets/<species>-1.jpg, then write the tile numbers you reject into rejects.json
python3 scripts/dataset/09_build_data.py ... --rejects rejects.json --hard hard.json --reviewed reviewed_ids.json
```

`07b`/`07c` learn from those labels to rank photos nobody has reviewed yet, which makes reviewing faster.

### Useful options for `09_build_data.py`

| option | meaning |
| --- | --- |
| `--commercial-ok` | keep only CC0 / CC BY / CC BY-SA photos (usable on a commercial site; still needs attribution) |
| `--max-per-species 60` | cap photos per species |
| `--min-per-species 6` | species with fewer usable photos are left out |
| `--min-snake 0.9` | minimum "a snake is clearly visible" score |
| `--no-write` | only report what would be built |

## Adding a species

1. Add its entry to a file in `data/kb` (copy a similar species). If iNaturalist uses a different name, set `inat`.
2. If it is indistinguishable from another species in photos, either list several names under one `inat` array
   (they become one quiz species) or add the pair to `noPair` in `data/kb/_pairs.json`.
3. Optionally write a hand-crafted note for its closest look-alikes in `_pairs.json`.
4. Re-run step 9. The validator tells you what is missing.

## Licences

iNaturalist photos keep their photographers' licences. The allowed set is `CC0`, `CC BY`, `CC BY-SA`, `CC BY-NC`
and `CC BY-NC-SA`. "No derivatives" photos are never used, because the pipeline resizes and re-encodes them.
Please credit photographers; the app and `CREDITS.md` do it for you.
