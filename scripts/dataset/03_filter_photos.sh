#!/usr/bin/env bash
# Step 3 - keep the photos (from the 20 GB photos.csv.gz) that belong to the
# observations selected in step 2 and carry a licence we can redistribute with
# modification (CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA; "ND" is excluded).
#
# Usage: 03_filter_photos.sh obs_snakes.tsv photos.csv.gz photos_snakes.tsv
# Output columns: photo_id observation_uuid extension license width height position
set -euo pipefail
OBS=${1:?obs_snakes.tsv}
PHOTOS=${2:?photos.csv.gz}
OUT=${3:?output.tsv}

gunzip -c "$PHOTOS" \
  | mawk -F'\t' -v OFS='\t' -v obs="$OBS" '
      BEGIN { while ((getline line < obs) > 0) { split(line, a, "\t"); keep[a[1]] = 1 } }
      NR > 1 && ($3 in keep) && ($5 == "jpg" || $5 == "jpeg" || $5 == "png") \
        && $6 != "" && $6 !~ /ND/ && $6 != "PD" {
          print $2, $3, $5, $6, $7, $8, $9
      }' > "$OUT"
echo "kept $(wc -l < "$OUT") photos -> $OUT"
