#!/usr/bin/env bash
# Step 2 - stream iNaturalist's open-data observations.csv.gz (~13 GB) and keep
# only research-grade snake observations inside a bounding box. Nothing large is
# written to disk. The box is set by REGION (step 4 then keeps only the points
# inside the region's states and provinces):
#   REGION=in (default)  the Indian subcontinent: lat 5..37.5, lon 60..98.5
#   REGION=na            the USA and Canada:      lat 24..62, lon -141..-52
#
# Usage: [REGION=na] 02_filter_observations.sh snake_taxa.tsv obs_snakes.tsv
# Output columns: observation_uuid observer_id lat lon accuracy_m taxon_id species_id observed_on anomaly
set -euo pipefail
TAXA=${1:?snake_taxa.tsv}
OUT=${2:?output.tsv}
URL=${OBS_URL:-https://inaturalist-open-data.s3.amazonaws.com/observations.csv.gz}
case "${REGION:-in}" in
  in) BOX="5 37.5 60 98.5" ;;
  na) BOX="24 62 -141 -52" ;;
  *) echo "unknown REGION ${REGION}" >&2; exit 2 ;;
esac
read -r LAT0 LAT1 LON0 LON1 <<< "$BOX"

curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$URL" \
  | gunzip -c \
  | mawk -F'\t' -v OFS='\t' -v taxa="$TAXA" -v lat0="$LAT0" -v lat1="$LAT1" -v lon0="$LON0" -v lon1="$LON1" '
      BEGIN { while ((getline line < taxa) > 0) { split(line, a, "\t"); sp[a[1]] = a[2] } }
      NR > 1 && $7 == "research" && ($6 in sp) && $3 != "" \
        && $3 + 0 >= lat0 && $3 + 0 <= lat1 && $4 + 0 >= lon0 && $4 + 0 <= lon1 {
          print $1, $2, $3, $4, $5, $6, sp[$6], $8, $9
      }' > "$OUT"
echo "kept $(wc -l < "$OUT") observations -> $OUT"
