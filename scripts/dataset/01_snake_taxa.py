#!/usr/bin/env python3
"""Step 1 - find every snake taxon in iNaturalist's open-data taxa.csv.gz.

iNaturalist's suborder Serpentes has taxon_id 85553.  Observations can be
identified to species *or* sub-species, so we write a lookup that maps every
snake taxon at species rank or below to its parent species.

Usage:  01_snake_taxa.py taxa.csv.gz snake_taxa.tsv
Output: tab-separated  taxon_id  species_id  species_name  (header-less)
"""
import csv
import gzip
import sys

SERPENTES = "85553"


def main(taxa_path, out_path):
    names, levels, ancestry = {}, {}, {}
    with gzip.open(taxa_path, "rt", newline="") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            tid = row["taxon_id"]
            names[tid] = row["name"]
            levels[tid] = float(row["rank_level"] or 100)
            ancestry[tid] = row["ancestry"].split("/") if row["ancestry"] else []

    written = species = 0
    with open(out_path, "w") as out:
        for tid, anc in ancestry.items():
            if SERPENTES not in anc or levels[tid] > 10:
                continue
            if levels[tid] == 10:
                sp = tid
            else:  # sub-species / variety / form -> climb to its species
                sp = next((a for a in reversed(anc) if levels.get(a) == 10), None)
                if sp is None:
                    continue
            # skip hybrids ("Genus x species")
            if " × " in names[sp] or " x " in names[sp]:
                continue
            out.write(f"{tid}\t{sp}\t{names[sp]}\n")
            written += 1
            species += levels[tid] == 10
    print(f"{written} snake taxa written ({species} species) -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
