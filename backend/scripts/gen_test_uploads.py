"""
gen_test_uploads.py — Generate 7 sequential test CSV files consistent with gold_standard.csv.
Each file has 5-6 rows and continues from the previous one.

Run from backend/:  python scripts/gen_test_uploads.py
"""
import pandas as pd
import numpy as np
from pathlib import Path

BASE     = Path(__file__).resolve().parent.parent
GOLD     = BASE / "data" / "gold_standard.csv"
OUT_DIR  = BASE / "data" / "test_uploads"
OUT_DIR.mkdir(exist_ok=True)

# Read gold standard to get last timestamp
df = pd.read_csv(GOLD)
df.columns = [str(c).strip() for c in df.columns]
df["_dt"] = pd.to_datetime(df["Start time UTC"], utc=True)
last_ts = df["_dt"].max()

# Realistic consumption values around the Gujarat grid range (~10000-13000 MWh)
BASE_CONSUMPTION = 4200  # small dataset range
rng = np.random.default_rng(42)

files_config = [
    ("test_upload_1.csv", 5),
    ("test_upload_2.csv", 6),
    ("test_upload_3.csv", 5),
    ("test_upload_4.csv", 6),
    ("test_upload_5.csv", 5),
    ("test_upload_6.csv", 6),
    ("test_upload_7.csv", 5),
]

current = last_ts
for fname, nrows in files_config:
    rows = []
    for i in range(nrows):
        start = current + pd.Timedelta(hours=1)
        end   = start   + pd.Timedelta(hours=1)
        # Slightly varying consumption with hour-of-day pattern
        hour_factor = 1 + 0.05 * np.sin(2 * np.pi * start.hour / 24)
        consumption = round(BASE_CONSUMPTION * hour_factor + rng.uniform(-50, 50), 1)
        rows.append({
            "Start time UTC":                  start.strftime("%Y-%m-%d %H:%M:%S+00:00"),
            "End time UTC":                    end.strftime("%Y-%m-%d %H:%M:%S+00:00"),
            "Electricity consumption (MWh)":   consumption,
        })
        current = start

    out_path = OUT_DIR / fname
    pd.DataFrame(rows).to_csv(out_path, index=False)
    print(f"Written {fname}: {nrows} rows  ({rows[0]['Start time UTC']} → {rows[-1]['Start time UTC']})")

print(f"\nAll files in: {OUT_DIR}")
