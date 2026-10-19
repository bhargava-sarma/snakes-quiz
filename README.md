# Sarpa · Indian Snake Quiz

A free photo quiz that teaches you to recognise the snakes of India, and **explains every answer**.

You are shown a real photograph and four options. Whether you get it right or wrong, you then see
*why the right snake is right* **and** *why each of the other options is not*, with the key visual
differences and a side-by-side comparison.

It is a plain static website (HTML, CSS and JavaScript, **no build step, no backend**), so it runs
on any web host, on GitHub Pages, or straight from the folder on your computer.

## Features

**The quiz**
- 20, 50 or 100 questions, four options each
- Four difficulty levels: *Beginner* (famous snakes, look-alikes kept apart), *Intermediate*, *Expert*
  (most options are genuine look-alikes) and *All species*
- Optional timer with bonus points for speed, hints (where the photo was taken, the snake's group and
  venom status, and a 50/50), streaks and points
- **Reasoning after every answer**: why it is the right snake, why each other option is wrong, how those
  snakes differ from the one in the photo, how dangerous each one is
- Every game is different: questions are built from thousands of photos, species are balanced, and photos
  you have already seen are avoided
- Fair by design: snakes that look identical in photographs (for example the newly split vine snakes) are
  grouped as one species or are never offered together
- Keyboard shortcuts (`1`–`4` or `A`–`D` to answer, `Enter` for next, `H` for a hint), works on phones

**Everything else**
- **Daily challenge**: ten new questions every day, identical for everyone, with a streak and a shareable result
- **Field guide** of every species: identification tips, size, habitat, range, look-alikes, photo gallery with credits, where in India it was photographed
- **Compare tool**: pick any two snakes and see how they differ
- **Flashcards** for relaxed studying
- **Region filter**: quiz yourself on the snakes recorded in your own state
- **My progress**: stats, a snake-dex of species you have mastered, weak-spot practice, badges, and a backup/restore file
- **Snakebite first aid** (the national "Do it R.I.G.H.T." guidance), the "Big Four", and myths vs facts
- Dark mode, installable as an app, works offline after the first visit, no accounts and no tracking

## Run it

Open `index.html` in a browser. Because there is no build step, you can also serve the folder:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

### Put it online (GitHub Pages)

1. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Merge to `main`. The workflow in `.github/workflows/pages.yml` publishes the site automatically.

Any other static host (Netlify, Cloudflare Pages, an S3 bucket, your own server) works as well: upload
`index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/`, `data/*.js`, `assets/` and `images/`.

## The photo data set

The photographs are **real, community-identified observations from [iNaturalist](https://www.inaturalist.org)**:

- only *research grade* observations (other naturalists agreed with the species identification)
- only photos taken **in India**, labelled with the state they were taken in
- only photos whose photographer chose an open **Creative Commons** licence
- cleaned in three ways: an image classifier removes photos where no snake is clearly visible, a person
  looked at the candidate photos on contact sheets and removed unusable ones (dead or crushed animals, a
  speck in a landscape, shed skins, collages ...), and near-duplicates are dropped. Awkward but identifiable
  photos are kept, flagged *hard*, and only shown at the harder levels

Every photo is credited under the picture, in the in-app **Photo credits** page and in
[`CREDITS.md`](CREDITS.md) / [`data/catalog.csv`](data/catalog.csv).

`scripts/dataset` rebuilds the whole set from iNaturalist's public open-data bucket, so you can regenerate it,
widen it (more species, more photos per species) or restrict it to commercially usable licences. See
[`scripts/dataset/README.md`](scripts/dataset/README.md).

> **Licensing note.** Many photographers use *CC BY-NC*, so the photos as shipped are for **non-commercial**
> use. If you want to monetise the site, rebuild the data with `--commercial-ok` (CC0 / CC BY / CC BY-SA only).

## The species knowledge base

All the teaching content lives in [`data/kb`](data/kb) as plain JSON, one file per group of species:

| field | meaning |
| --- | --- |
| `id`, `sci`, `name`, `aka`, `local` | names (common, scientific, other English names, local-language names) |
| `family`, `kind`, `tier` | family, an everyday group name, and identification difficulty 1 (easy) to 5 (very hard) |
| `venom`, `big4` | `deadly`, `venomous`, `mild` (rear-fanged) or `none`; one of the "Big Four" |
| `len`, `habitat`, `range`, `diet`, `active` | quick facts |
| `ids` | the "how to identify it" bullet points |
| `look` | short phrases (colour, pattern, head, body) used in side-by-side tables |
| `t` | machine-readable traits (hood, head, snout, pupil, scales, build, size, habit, pattern, hue) used to work out *what differs* between two snakes and which options are look-alikes |
| `grp` | look-alike groups used to choose tricky options |
| `inat` | the iNaturalist names that count as this species (to merge cryptic species) |
| `fact` | a "did you know?" line |

`_pairs.json` holds hand-written notes for the most confusable pairs (`pairs`) and sets of species that cannot be
told apart from a photo (`noPair`, never asked together). Where no hand-written note exists, the app writes the
"why not" explanation itself from the traits.

To add or fix a species, edit the JSON and run `scripts/dataset/09_build_data.py` (it validates the file).

> The descriptions are written for general education from standard field-guide knowledge. They are not
> peer-reviewed, so please report mistakes (an issue or pull request is perfect).

## Quality checks

With the site served on port 8765 (`python3 -m http.server 8765`) and Playwright installed:

```bash
node scripts/qa/engine_check.js   # 4,500+ generated questions: 4 unique options, right answer, no look-alike clashes, balance...
node scripts/qa/smoke.js          # every page and species page: no stray "null"/"undefined", no errors, no broken photos
node scripts/qa/e2e.js            # 40-step run-through: timer, hints, wrong/right explanations, reload-and-resume, results,
                                  # daily challenge parity between two players, region filter, reporting a photo, phone layout
```

## Project layout

```
index.html  sw.js  manifest.webmanifest
css/app.css                         styling (light + dark theme)
js/                                 the app: engine (question building), explain (why-not logic), quiz, guide, results ...
data/kb/*.json                      the species knowledge base (hand-written)
data/species.js  data/photos.js     generated for the app by scripts/dataset/09_build_data.py
data/catalog.csv                    every photo with species, state, photographer, licence and source link
images/<species>/<photo-id>.avif    the photos (800 px, AVIF) and images/thumbs/ for the cover pictures
scripts/dataset/                    the data-set pipeline (iNaturalist open data -> photos)
scripts/qa/                         browser-based tests
```

## Safety

Identifying a snake from a photo is a learning game, **not a safety tool**. Never touch, corner or try to catch a
wild snake. After a bite, go to a hospital immediately (the app has a first-aid page).

## Licences and credits

- Code: [MIT](LICENSE)
- Species descriptions (`data/kb`): CC BY 4.0
- Photographs: © their photographers, under the Creative Commons licence shown with each photo
  (see [`CREDITS.md`](CREDITS.md))
- State names are derived from each photo's location using OpenStreetMap-based boundaries © OpenStreetMap contributors
