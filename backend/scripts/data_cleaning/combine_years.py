"""
combine_years.py
----------------
Reads all per-year CSVs from the data/ directory, adds a 'Year' column to each,
and writes the combined dataset to data/all_years.csv.

Usage:
    python analysis/combine_years.py
"""

import re
from pathlib import Path

import pandas as pd

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]      # repo root
DATA_DIR = ROOT / "data" / "iced-niti"
OUTPUT = DATA_DIR / "all_years.csv"

# ── collect & label ──────────────────────────────────────────────────────────
dfs = []

for csv_file in sorted(DATA_DIR.glob("y*.csv")):
    # extract year from filename: y2023.csv → 2023
    match = re.search(r"y(\d{4})\.csv$", csv_file.name)
    if not match:
        print(f"[SKIP] unrecognised filename: {csv_file.name}")
        continue

    year = int(match.group(1))
    print(f"[READ] {csv_file.name}  (year={year})")

    df = pd.read_csv(csv_file)

    # insert Year as the second column (after State)
    df.insert(1, "Year", year)

    dfs.append(df)

# ── combine & save ───────────────────────────────────────────────────────────
if not dfs:
    raise FileNotFoundError("No y<year>.csv files found in data/")

combined = pd.concat(dfs, ignore_index=True)

combined.to_csv(OUTPUT, index=False)

print(f"\nDone. Saved {len(combined):,} rows -> {OUTPUT.relative_to(ROOT)}")
print(combined.head())
print(f"\nYear distribution:\n{combined['Year'].value_counts().sort_index()}")
