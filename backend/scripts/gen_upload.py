"""
gen_upload.py — Generate a single upload CSV consistent with gold_standard.csv.

- Continues hourly from the last timestamp in gold_standard.csv
- Total rows: configurable via --rows (default 24)
- p = random(2, 5) anomalous rows (spike or dip, z-score > 2.5)
- Output filename: upload_<4-digit-hex>.csv  in data/test_uploads/

Usage:
    python scripts/gen_upload.py
    python scripts/gen_upload.py --rows 12
"""
import argparse
import random
import secrets
from pathlib import Path

import numpy as np
import pandas as pd

BASE    = Path(__file__).resolve().parent.parent
GOLD    = BASE / "data" / "gold_standard.csv"
OUT_DIR = BASE / "data" / "test_uploads"
OUT_DIR.mkdir(exist_ok=True)


def last_timestamp(gold_path: Path) -> pd.Timestamp:
    df = pd.read_csv(gold_path)
    df.columns = [str(c).strip() for c in df.columns]
    df["_dt"] = pd.to_datetime(df["Start time UTC"], utc=True)
    last = df["_dt"].max()
    tail = df[df["_dt"] >= (last - pd.Timedelta(hours=72))].copy()
    return last, tail


def hour_factor(ts: pd.Timestamp) -> float:
    """Simple hour-of-day demand curve (peaks mid-morning and evening)."""
    h = ts.hour
    return 1.0 + 0.08 * np.sin(2 * np.pi * (h - 6) / 24)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=24, help="Number of rows to generate")
    args = parser.parse_args()

    last_ts, tail_df = last_timestamp(GOLD)

    # Estimate baseline from tail of gold standard
    tail_df["consumption"] = pd.to_numeric(tail_df["Electricity consumption (MWh)"], errors="coerce")
    baseline_mean = float(tail_df["consumption"].mean())
    baseline_std  = max(float(tail_df["consumption"].std()), 1.0)

    # Pick p random anomalous row indices
    n = args.rows
    p = random.randint(2, 5)
    anomaly_indices = set(random.sample(range(n), min(p, n)))
    print(f"Generating {n} rows, {p} anomalous at indices: {sorted(anomaly_indices)}")

    rows = []
    current = last_ts
    rng = np.random.default_rng(secrets.randbits(32))

    for i in range(n):
        start = current + pd.Timedelta(hours=1)
        end   = start   + pd.Timedelta(hours=1)

        if i in anomaly_indices:
            # Anomaly: spike (+) or dip (-) with z-score between 2.5 and 4.0
            direction = rng.choice([-1, 1])
            z = rng.uniform(2.5, 4.0)
            consumption = baseline_mean + direction * z * baseline_std
            consumption = max(consumption, 100.0)          # never negative
            kind = "spike" if direction > 0 else "dip"
            print(f"  row {i:3d}: ANOMALY ({kind})  z={z:.2f}  val={consumption:.1f}")
        else:
            # Normal: hour-of-day pattern + small noise
            consumption = baseline_mean * hour_factor(start) + rng.normal(0, baseline_std * 0.05)
            consumption = max(consumption, 100.0)

        rows.append({
            "Start time UTC":                 start.strftime("%Y-%m-%d %H:%M:%S+00:00"),
            "End time UTC":                   end.strftime("%Y-%m-%d %H:%M:%S+00:00"),
            "Electricity consumption (MWh)":  round(float(consumption), 2),
        })
        current = start

    out_name = f"upload_{secrets.token_hex(2)}.csv"
    out_path = OUT_DIR / out_name
    pd.DataFrame(rows).to_csv(out_path, index=False)

    print(f"\nWritten: {out_path}")
    print(f"  rows : {n}  |  anomalies: {p}")
    print(f"  range: {rows[0]['Start time UTC']} -> {rows[-1]['Start time UTC']}")


if __name__ == "__main__":
    main()
