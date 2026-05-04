"""
refit_scalers.py — Re-fit scalers from the full historical data and overwrite
                   the broken pickle files in models/final_submission/.

Also resets gold_standard.csv to the last 200 rows of energy_consumption_data.csv
so future uploads have a valid anchor point.

Run once from the backend dir:
    venv\\Scripts\\python.exe scripts\\refit_scalers.py
"""
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

BASE      = Path(__file__).resolve().parent.parent          # …/backend
HIST_CSV  = BASE / "data" / "energy_consumption_data.csv"
GOLD_CSV  = BASE / "data" / "gold_standard.csv"
OUT       = BASE / "models" / "final_submission"

FEATURE_COLS = [
    "hour_sin", "hour_cos",
    "month_sin", "month_cos",
    "lag_1h", "lag_24h", "lag_168h",
    "roll_mean_24h", "roll_std_24h",
    "diff_1h",
]
TARGET_COL = "consumption"
REQUIRED_COLS = ["Start time UTC", "End time UTC", "Electricity consumption (MWh)"]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    df["datetime"] = pd.to_datetime(df["Start time UTC"], utc=True)
    df = df.sort_values("datetime").reset_index(drop=True)
    df["consumption"] = pd.to_numeric(df["Electricity consumption (MWh)"], errors="coerce")
    df = df.dropna(subset=["consumption"])

    hour  = df["datetime"].dt.hour
    month = df["datetime"].dt.month

    df["hour_sin"]  = np.sin(2 * np.pi * hour  / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * hour  / 24)
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)

    df["lag_1h"]   = df["consumption"].shift(1)
    df["lag_24h"]  = df["consumption"].shift(24)
    df["lag_168h"] = df["consumption"].shift(168)

    df["roll_mean_24h"] = df["consumption"].rolling(24, min_periods=1).mean()
    df["roll_std_24h"]  = df["consumption"].rolling(24, min_periods=1).std().fillna(0)
    df["diff_1h"]       = df["consumption"].diff(1).fillna(0)

    # Fill remaining NaN lags with forward/backward fill then 0
    for col in ["lag_1h", "lag_24h", "lag_168h"]:
        df[col] = df[col].bfill().fillna(0)

    df = df.dropna(subset=FEATURE_COLS + [TARGET_COL])
    return df


def main():
    print(f"Python: {sys.version}")

    # ── Load historical data ─────────────────────────────────────────────────
    if not HIST_CSV.exists():
        print(f"ERROR: {HIST_CSV} not found", file=sys.stderr)
        sys.exit(1)

    print(f"\nLoading historical data from: {HIST_CSV.name}")
    df = pd.read_csv(HIST_CSV)
    df.columns = [str(c).strip() for c in df.columns]
    print(f"  Raw rows: {len(df)}")

    # Check which column name we have (might differ)
    print(f"  Columns: {list(df.columns[:5])}")

    # Normalise column names to standard
    col_map = {}
    for col in df.columns:
        cl = col.strip().lower()
        if "start" in cl and "time" in cl:
            col_map[col] = "Start time UTC"
        elif "end" in cl and "time" in cl:
            col_map[col] = "End time UTC"
        elif "electricity" in cl or "consumption" in cl or "mwh" in cl:
            col_map[col] = "Electricity consumption (MWh)"
    df = df.rename(columns=col_map)
    print(f"  Normalised columns: {list(df.columns[:5])}")

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        print(f"ERROR: Missing columns after normalisation: {missing}", file=sys.stderr)
        sys.exit(1)

    # ── Feature engineering ──────────────────────────────────────────────────
    feat_df = build_features(df)
    print(f"  Rows after feature engineering: {len(feat_df)}")

    if len(feat_df) < 10:
        print("ERROR: not enough rows to fit scalers (need ≥ 10)", file=sys.stderr)
        sys.exit(1)

    X = feat_df[FEATURE_COLS].values
    y = feat_df[TARGET_COL].values.reshape(-1, 1)

    scaler_X = StandardScaler().fit(X)
    scaler_y = StandardScaler().fit(y)
    print("  [OK] Scalers fitted")

    # ── Save scalers ─────────────────────────────────────────────────────────
    OUT.mkdir(parents=True, exist_ok=True)
    sx_path = OUT / "final_prefix_scaler_X.pkl"
    sy_path = OUT / "final_prefix_scaler_y.pkl"

    with open(sx_path, "wb") as f:
        pickle.dump(scaler_X, f, protocol=4)   # protocol 4 = Py3.8+ compatible
    with open(sy_path, "wb") as f:
        pickle.dump(scaler_y, f, protocol=4)
    print("  [OK] scaler_X -> " + sx_path.name)
    print("  [OK] scaler_y -> " + sy_path.name)

    # ── Reset gold_standard.csv to last 200 rows of historical data ──────────
    print("\nResetting gold_standard.csv ...")
    tail = df[REQUIRED_COLS].copy()
    tail["_dt"] = pd.to_datetime(tail["Start time UTC"], utc=True, errors="coerce")
    tail = tail.dropna(subset=["_dt"]).sort_values("_dt").reset_index(drop=True)
    tail = tail.tail(200).drop(columns=["_dt"])
    tail.to_csv(GOLD_CSV, index=False)
    print("  [OK] gold_standard.csv reset to last " + str(len(tail)) + " rows")
    print("       Last timestamp: " + str(tail["Start time UTC"].iloc[-1]))

    print("\n[DONE] Scalers refitted. You can now trigger a retrain job.")


if __name__ == "__main__":
    main()
