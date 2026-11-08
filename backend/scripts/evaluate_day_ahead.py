"""Leak-free day-ahead evaluation of the LightGBM demand forecaster.

Why this exists
---------------
The hackathon notebook (notebooks/forecasting_models.ipynb) used `lag_1`, the
actual demand one hour earlier, as a feature. That is fine for a one-hour-ahead
forecast, but the walk-forward check fed the *true* lag_1 into every hour of a
24-hour window, so it measured one-hour-ahead accuracy and reported it as a
day-ahead number (about 0.65% MAPE). This script measures what the model can
really do 24 hours ahead.

Rules enforced here
-------------------
1. Every feature for target hour t uses only demand observed at or before t-24h.
   (Lags of 24h and more; rolling statistics that end at t-24h.)
2. Chronological split, never shuffled:
       train      2016-01-01 .. 2019-12-31
       validation 2020-01-01 .. 2020-12-31   (model choice, early stopping)
       test       2021-01-01 .. 2021-12-31   (read exactly once, at the end)
   The final model is refit on train+validation with the number of trees
   chosen on validation, then scored on test.
3. Anything fitted (outlier caps) is fitted on training rows only.
4. Gaps are filled forward only, so a filled value never comes from the future.
   Scores are computed only on hours that have a real reading.
5. The model must beat two naive baselines under the same rules:
   "same hour yesterday" (lag 24) and "same hour last week" (lag 168).

The 1-hour-ahead setup is also reported, clearly labelled, so the gap between
the two is visible.

Run from backend/:
    python scripts/evaluate_day_ahead.py
"""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "Adani_Datasets" / "hourly_consumption.xlsx"
OUT = Path(__file__).resolve().parents[1] / "analysis" / "day_ahead_evaluation.json"

TRAIN_END = "2019-12-31 23:00"
VAL_END = "2020-12-31 23:00"
TEST_END = "2021-12-31 23:00"
SEED = 42


def mape(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs((y - p) / y)) * 100)


def load_hourly() -> pd.DataFrame:
    """Hourly series on a regular grid.

    The raw file has 736 rows stamped at odd minutes (e.g. 16:05, 17:30) mixed
    in with on-the-hour rows. Each reading is assigned to the hour it starts in;
    readings sharing an hour are averaged.
    """
    raw = pd.read_excel(DATA)
    raw["hour"] = raw["Start time UTC"].dt.floor("h")
    y = raw.groupby("hour")["Electricity consumption (MWh)"].mean()
    grid = pd.date_range(y.index.min(), y.index.max(), freq="h")
    df = pd.DataFrame(index=grid)
    df["y"] = y.reindex(grid)
    df["observed"] = df["y"].notna()
    return df


def build_features(df: pd.DataFrame, min_lag: int) -> pd.DataFrame:
    """Features for predicting y[t] using only data up to t - min_lag."""
    out = pd.DataFrame(index=df.index)
    # Forward fill only: a filled value is always an older reading.
    s = df["y_capped"].ffill()
    base = s.shift(min_lag)  # the newest value the model is allowed to see

    lags = sorted({min_lag, 24, 48, 72, 168, 336} | ({min_lag + 1} if min_lag == 1 else set()))
    for lag in lags:
        if lag >= min_lag:
            out[f"lag_{lag}"] = s.shift(lag)
    out["roll_mean_24"] = base.rolling(24).mean()
    out["roll_std_24"] = base.rolling(24).std()
    out["roll_mean_168"] = base.rolling(168).mean()

    idx = df.index
    out["hour_sin"] = np.sin(2 * np.pi * idx.hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * idx.hour / 24)
    out["dow"] = idx.dayofweek
    out["is_weekend"] = (idx.dayofweek >= 5).astype(int)
    out["month_sin"] = np.sin(2 * np.pi * idx.month / 12)
    out["month_cos"] = np.cos(2 * np.pi * idx.month / 12)
    return out


def evaluate(min_lag: int) -> dict:
    df = load_hourly()
    train_mask = df.index <= TRAIN_END
    # Outlier caps from training rows only.
    lo, hi = df.loc[train_mask, "y"].quantile([0.01, 0.99])
    df["y_capped"] = df["y"].clip(lo, hi)

    X = build_features(df, min_lag)
    y = df["y"]  # targets are the raw readings, never the capped ones
    usable = df["observed"] & X.notna().all(axis=1)

    tr = usable & (df.index <= TRAIN_END)
    va = usable & (df.index > TRAIN_END) & (df.index <= VAL_END)
    te = usable & (df.index > VAL_END) & (df.index <= TEST_END)

    params = dict(
        objective="regression_l1",  # MAE objective, closer to MAPE than L2
        learning_rate=0.03,
        num_leaves=63,
        min_child_samples=50,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        random_state=SEED,
        verbose=-1,
    )

    # 1) Choose the number of trees on 2020 only.
    m = lgb.LGBMRegressor(n_estimators=5000, **params)
    m.fit(
        X[tr], y[tr],
        eval_set=[(X[va], y[va])],
        eval_metric="l1",
        callbacks=[lgb.early_stopping(200, verbose=False)],
    )
    best_iter = int(m.best_iteration_)
    val_mape = mape(y[va].to_numpy(), m.predict(X[va], num_iteration=best_iter))

    # 2) Refit on 2016-2020 with that many trees, then read 2021 once.
    final = lgb.LGBMRegressor(n_estimators=best_iter, **params)
    final.fit(X[tr | va], y[tr | va])
    pred = final.predict(X[te])
    y_te = y[te].to_numpy()

    result = {
        "horizon_hours": min_lag,
        "train_rows": int(tr.sum()),
        "val_rows": int(va.sum()),
        "test_rows": int(te.sum()),
        "trees": best_iter,
        "val_mape_2020": round(val_mape, 3),
        "test_mape_2021": round(mape(y_te, pred), 3),
        "test_mae_2021": round(float(np.mean(np.abs(y_te - pred))), 1),
    }
    if min_lag >= 24:
        # Naive baselines under the same rules, scored on the same test hours.
        s = df["y"].ffill()
        for name, lag in (("naive_same_hour_yesterday", 24), ("naive_same_hour_last_week", 168)):
            result[f"{name}_test_mape_2021"] = round(mape(y_te, s.shift(lag)[te].to_numpy()), 3)
        imp = pd.Series(final.booster_.feature_importance("gain"), index=X.columns)
        result["top_features_by_gain"] = imp.sort_values(ascending=False).head(5).index.tolist()
    return result


def main() -> None:
    results = {"day_ahead": evaluate(24), "hour_ahead": evaluate(1)}
    OUT.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
