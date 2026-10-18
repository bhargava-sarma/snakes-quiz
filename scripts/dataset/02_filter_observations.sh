#!/usr/bin/env bash
# Step 2 - stream iNaturalist's open-data observations.csv.gz (~13 GB) and keep
# only research-grade snake observations inside the Indian-subcontinent bounding
# box (lat 5..37.5, lon 60..98.5).  Nothing large is written to disk.
#
# Usage: 02_filter_observations.sh snake_taxa.tsv obs_snakes.tsv
# Output columns: observation_uuid observer_id lat lon accuracy_m taxon_id species_id observed_on anomaly
set -euo pipefail
TAXA=${1:?snake_taxa.tsv}
OUT=${2:?output.tsv}
URL=${OBS_URL:-https://inaturalist-open-data.s3.amazonaws.com/observations.csv.gz}

curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$URL" \
  | gunzip -c \
  | mawk -F'\t' -v OFS='\t' -v taxa="$TAXA" '
      BEGIN { while ((getline line < taxa) > 0) { split(line, a, "\t"); sp[a[1]] = a[2] } }
      NR > 1 && $7 == "research" && ($6 in sp) && $3 != "" \
        && $3 + 0 >= 5 && $3 + 0 <= 37.5 && $4 + 0 >= 60 && $4 + 0 <= 98.5 {
          print $1, $2, $3, $4, $5, $6, sp[$6], $8, $9
      }' > "$OUT"
echo "kept $(wc -l < "$OUT") observations -> $OUT"
