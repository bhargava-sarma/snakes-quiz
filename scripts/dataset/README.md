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
- a polygon file of the states for step 4: for India e.g. `countries/in/in-all.geo.json` from the npm package
  `@highcharts/map-collection` (OpenStreetMap data); for North America Natural Earth's public-domain
  `ne_50m_admin_1_states_provinces` (keep the USA and Canada, without Hawaii). They are only used to *label* photos with a
  state or province and are not redistributed
- for the optional quality filter (steps 7, 7b): the ResNet-50 v2 ONNX model and class names from the ONNX model zoo

## The pipeline

| step | script | what it does |
| --- | --- | --- |
| 1 | `01_snake_taxa.py` | finds every snake taxon (suborder Serpentes) in `taxa.csv.gz` and maps sub-species to species |
| 2 | `02_filter_observations.sh` | streams `observations.csv.gz` (13 GB) and keeps research-grade snake observations in the region's box (`REGION=in` or `REGION=na`) |
| 3 | `03_filter_photos.sh` | streams `photos.csv.gz` (21 GB) and keeps the photos of those observations whose licence allows redistribution (no "ND") |
| 4 | `04_build_candidates.py` | joins observations, photos and photographers; keeps observations inside the region and labels each with its state or province (`--region in` or `--region na`) |
| 5 | `05_select_pool.py` | picks a candidate pool per species: size/aspect limits, one photo per observation, at most 3 per photographer |
| 6 | `06_fetch_images.py` | downloads each photo from the open-data bucket, re-encodes it as an 800 px AVIF (about 35 KB) and records sharpness and a perceptual hash |
| 7 | `07_score_images.py` | scores how prominently a snake appears (ImageNet snake classes, three views per photo) |
| 7b/7c | `07b_embed_images.py`, `07c_rank_quality.py` | optional: learns "is this a good quiz photo?" from your own good/hard/reject labels |
| 8 | `08_contact_sheets.py` | makes numbered contact sheets so a person can quickly mark unusable photos |
| 9 | `09_build_data.py` | combines the knowledge base (`data/kb`) with the chosen photos and writes `images/`, `data/species.js`, `data/photos.js`, `data/catalog.csv`, `CREDITS.md` |
| 10 | `10_server_data.js` | writes `server/generated/data.json` for the accounts API: species, which species each photo shows, and five years of daily puzzles (Sarpa and Herpdle), made with the website's own code |

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
node ../../scripts/dataset/10_server_data.js                                                   # after every step 9
```

### A second region (North America)

Steps 2 to 7b run once per region, each into its own work folder; step 9 then builds both together and step 10 writes
one schedule with a daily puzzle for each region. India's puzzles do not change when North America is added (each
region has its own random seeds).

```bash
REGION=na ../../scripts/dataset/02_filter_observations.sh snake_taxa.tsv obs_na.tsv
../../scripts/dataset/03_filter_photos.sh obs_na.tsv photos.csv.gz photos_na.tsv
python3 ../../scripts/dataset/04_build_candidates.py --region na --obs obs_na.tsv --photos photos_na.tsv \
    --observers observers.csv.gz --taxa snake_taxa.tsv --states us-canada.geo.json --out candidates_na.jsonl
python3 ../../scripts/dataset/05_select_pool.py --candidates candidates_na.jsonl --out pool_na.json
python3 ../../scripts/dataset/06_fetch_images.py --pool pool_na.json --out ../out_na
python3 ../../scripts/dataset/07_score_images.py --work ../out_na --model resnet50v2.onnx --synset synset.txt
python3 ../../scripts/dataset/07b_embed_images.py --work ../out_na --model resnet50v2.onnx
# rate both regions with one model, trained on the labels you already have
python3 ../../scripts/dataset/07c_rank_quality.py --work ../out ../out_na --sheets sheets --rejects rejects.json --hard hard.json --reviewed review.log
python3 ../../scripts/dataset/09_build_data.py --repo ../.. --pool pool.json --work ../out --pool pool_na.json --work ../out_na \
    --rejects rejects.json --rejects rejects_na.json --hard hard.json --hard hard_na.json \
    --reviewed reviewed_ids.json --reviewed reviewed_na.json --clear clear_na.json \
    --quality ../out/quality.jsonl --quality ../out_na/quality.jsonl \
    --min-snake 0.9 --max-per-species 250 --max-in-region na=60 --auto na=0.3
node ../../scripts/dataset/10_server_data.js
```

`--auto na=0.3` lets the 7c model decide for North America photos nobody has reviewed (it keeps those it rates at 0.3
or more, and flags the ones it thinks are hard); `--list-chosen chosen.json` writes the chosen photos so that you can put
the doubtful ones on contact sheets and review them (`rejects_na.json`, `hard_na.json`, and `clear_na.json` for photos
you judged clear). For the shipped data set, a person reviewed every chosen North America photo the model was less than
85% sure about. A species' `cover` in `data/kb` picks its cover photo by hand.

Always run step 10 after step 9 and deploy both together: the API checks answers and hands out the daily puzzles
from that file. Days that have already started keep their puzzles (as long as their photos are still in the data
set), so a rebuild does not change a puzzle people are playing.

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
| `--min-snake 0.9` | minimum "a snake is clearly visible" score (photos a person reviewed and kept are not held to it) |
| `--max-in-region na=60` | a different photo cap for one region |
| `--auto na=0.3` | in that region, trust the 7c model for photos nobody reviewed (minimum predicted P(keep)) |
| `--clear clear.json` | photos a person judged clear: never flagged hard by the model |
| `--list-chosen out.json` | write the chosen photos (species, photo, region, hard), e.g. to review them |
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
