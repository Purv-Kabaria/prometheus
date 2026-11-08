# Day-ahead evaluation of the LightGBM forecaster

Reproduce with `python scripts/evaluate_day_ahead.py` from `backend/` (needs `lightgbm`, `pandas`, `openpyxl`).
Results are written to `analysis/day_ahead_evaluation.json`.

## Results (test year 2021, read once)

| Model | Horizon | MAPE 2021 | MAE 2021 (MWh) |
|---|---|---|---|
| **LightGBM** | **24 h ahead** | **2.59%** | 261.8 |
| Naive: same hour yesterday | 24 h ahead | 3.73% | |
| Naive: same hour last week | 24 h ahead | 5.75% | |
| LightGBM | 1 h ahead | 0.66% | 63.5 |

Validation MAPE (2020) for the day-ahead model was 2.59%, the same as test, so the model is not
overfitting the validation year. It cuts error by about 30% compared to the best naive forecast.

## Why the hackathon notebook reported 0.65%

`notebooks/forecasting_models.ipynb` used `lag_1`, the actual demand one hour earlier. Its
walk-forward check predicted 24 hours at a time but gave the model the *true* `lag_1` for every one of
those hours, which is information a real day-ahead forecast does not have. So 0.65% is one-hour-ahead
accuracy. The 1 h row above reproduces it (0.66%).

The `tcn_xgb` model's "1.54% MAPE" label in `api/routes/model_inference.py` is a hard-coded string. No
script in this repository produces it, and that model also uses `lag_1h` and `diff_1h`, so it is not a
day-ahead number either.

## Rules the evaluation enforces

1. Every feature for hour *t* uses only demand at or before *t − 24h*.
2. Chronological split: train 2016–2019, validation 2020, test 2021. The number of trees is chosen
   on 2020; the final model is refit on 2016–2020 and scored on 2021 once.
3. Outlier caps (1st/99th percentile) are fitted on training rows only, and targets are never capped.
4. 736 readings stamped at odd minutes (e.g. 16:05) are assigned to the hour they start in, and
   readings sharing an hour are averaged. Gaps are forward-filled only. Only hours with a real reading
   are scored.
5. The model has to beat the naive baselines under the same rules.

Top features by gain: `lag_24`, `lag_168`, day of week, `lag_48`, 168-hour rolling mean, which matches
the daily and weekly cycles visible in the periodogram.
