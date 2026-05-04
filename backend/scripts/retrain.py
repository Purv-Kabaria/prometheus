"""
retrain.py — Fast incremental fine-tuning for the Prometheus TCN + XGB pipeline.

Speed targets
-------------
* Default: 2 epochs, batch_size=32, XGB n_estimators=30  → finishes in ~5-15 s on CPU
* Adaptive window: uses min(24, n_rows-1) so small uploads (e.g. 5-row test CSVs) work
* Only final head layers are unfrozen by default (freeze_backbone=True) → much faster
* All print() calls are flush=True so the frontend log tail updates in real-time

Invoked by pipeline.py via asyncio.create_subprocess_exec:
  python retrain.py
        --job-id        <uuid>
        --data-path     <path-to-new-csv>
        --new-version   v3
        --parent-version v2
        --model-dir     <path>/models
        --registry-path <path>/models/registry.json
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import shutil
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# XGBoost optional
try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

# Use at most 2 CPU threads so the OS + FastAPI stay responsive
torch.set_num_threads(2)

# ─────────────────────────────────────────────────────────────────────────────
# Logging — every line is flushed immediately so the frontend sees it live
# ─────────────────────────────────────────────────────────────────────────────
_t0 = time.monotonic()

def log(msg: str, *, step: str = "") -> None:
    elapsed = time.monotonic() - _t0
    ts  = datetime.now(timezone.utc).strftime("%H:%M:%S")
    tag = f"[{step}] " if step else ""
    print(f"[{ts}] (+{elapsed:5.1f}s) {tag}{msg}", flush=True)

def section(title: str) -> None:
    bar = "─" * 50
    print(f"\n{bar}", flush=True)
    print(f"  {title}", flush=True)
    print(bar, flush=True)

def write_job_status(version_dir: Path, status: str, extra: dict | None = None) -> None:
    payload = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if extra:
        payload.update(extra)
    (version_dir / "job_status.json").write_text(json.dumps(payload, indent=2))

# ─────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ─────────────────────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "hour_sin", "hour_cos",
    "month_sin", "month_cos",
    "lag_1h", "lag_24h", "lag_168h",
    "roll_mean_24h", "roll_std_24h",
    "diff_1h",
]
TARGET_COL  = "consumption"
FULL_WINDOW = 24   # ideal look-back; shrinks for tiny uploads


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
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

    df = df.dropna(subset=FEATURE_COLS + [TARGET_COL])
    return df


def make_sequences(X: np.ndarray, y: np.ndarray, window: int):
    xs, ys = [], []
    for i in range(window, len(X)):
        xs.append(X[i - window: i])
        ys.append(y[i])
    return np.array(xs, dtype=np.float32), np.array(ys, dtype=np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# TCN architecture
# ─────────────────────────────────────────────────────────────────────────────
class _CausalConv1d(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, kernel: int, dilation: int):
        super().__init__()
        self.padding = (kernel - 1) * dilation
        self.conv = nn.Conv1d(in_ch, out_ch, kernel, padding=self.padding, dilation=dilation)

    def forward(self, x):
        return self.conv(x)[:, :, : x.size(2)]


class _TCNBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, kernel: int, dilation: int, dropout: float):
        super().__init__()
        self.net = nn.Sequential(
            _CausalConv1d(in_ch, out_ch, kernel, dilation), nn.BatchNorm1d(out_ch),
            nn.ReLU(), nn.Dropout(dropout),
            _CausalConv1d(out_ch, out_ch, kernel, dilation), nn.BatchNorm1d(out_ch),
            nn.ReLU(), nn.Dropout(dropout),
        )
        self.downsample = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        self.relu = nn.ReLU()

    def forward(self, x):
        return self.relu(self.net(x) + self.downsample(x))


class TCN(nn.Module):
    def __init__(self, n_features: int = 10, channels: list = None,
                 kernel_size: int = 3, dropout: float = 0.2):
        super().__init__()
        channels = channels or [64, 128, 64]
        layers, in_ch = [], n_features
        for i, out_ch in enumerate(channels):
            layers.append(_TCNBlock(in_ch, out_ch, kernel_size, dilation=2**i, dropout=dropout))
            in_ch = out_ch
        self.tcn  = nn.Sequential(*layers)
        self.head = nn.Linear(channels[-1], 1)

    def forward(self, x):
        # x: (B, W, F) → permute → (B, F, W)
        return self.head(self.tcn(x.permute(0, 2, 1))[:, :, -1]).squeeze(-1)


# ─────────────────────────────────────────────────────────────────────────────
# Main retrain function
# ─────────────────────────────────────────────────────────────────────────────
def retrain(
    job_id:          str,
    data_path:       Path,
    new_version:     str,
    parent_version:  str,
    model_dir:       Path,
    registry_path:   Path,
    epochs:          int   = 2,      # ← was 5; 2 is plenty for fine-tuning
    batch_size:      int   = 32,     # ← was 64; smaller = faster per-step
    lr:              float = 5e-5,   # ← conservative LR for warm-start
    freeze_backbone: bool  = True,   # only train the final linear head
    xgb_trees:       int   = 30,     # ← was 200; fast residual patch
) -> None:

    version_dir = model_dir / new_version
    version_dir.mkdir(parents=True, exist_ok=True)
    write_job_status(version_dir, "running", {"job_id": job_id})

    # ── 1. Load artefacts — always from final_submission ─────────────────────
    section("STEP 1/7 · Loading parent artefacts")
    parent_dir = model_dir / "final_submission"
    log(f"Parent dir : {parent_dir}", step="LOAD")

    scaler_X_path = parent_dir / "final_prefix_scaler_X.pkl"
    scaler_y_path = parent_dir / "final_prefix_scaler_y.pkl"
    tcn_path      = parent_dir / "final_prefix_tcn_weights.pth"
    xgb_path      = parent_dir / "final_prefix_xgb_corrector.json"

    with open(scaler_X_path, "rb") as f:
        scaler_X = pickle.load(f)
    log("✓ scaler_X loaded", step="LOAD")

    with open(scaler_y_path, "rb") as f:
        scaler_y = pickle.load(f)
    log("✓ scaler_y loaded", step="LOAD")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log(f"Device     : {device}", step="LOAD")

    model = TCN(n_features=len(FEATURE_COLS)).to(device)
    state = torch.load(tcn_path, map_location=device, weights_only=True)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing:
        log(f"   (weights not loaded for {len(missing)} keys — fresh init for those)", step="LOAD")
    log("✓ TCN weights loaded (warm-start)", step="LOAD")

    # ── 2. Feature engineering ───────────────────────────────────────────────
    section("STEP 2/7 · Building features")
    log(f"Reading CSV : {data_path}", step="FEAT")
    new_df  = pd.read_csv(data_path)
    new_df.columns = [str(c).strip() for c in new_df.columns]
    n_raw   = len(new_df)
    log(f"Raw rows (upload) : {n_raw}", step="FEAT")

    # Load gold_standard for lag context (needed for lag_168h etc.)
    gold_path = data_path.parent.parent / "data" / "gold_standard.csv"
    if not gold_path.exists():
        gold_path = model_dir.parent / "data" / "gold_standard.csv"

    if gold_path.exists():
        gold_df = pd.read_csv(gold_path)
        gold_df.columns = [str(c).strip() for c in gold_df.columns]
        combined_df = pd.concat([gold_df, new_df], ignore_index=True)
        log(f"Combined with gold ({len(gold_df)} rows) = {len(combined_df)} total rows", step="FEAT")
    else:
        combined_df = new_df
        log("gold_standard.csv not found — using upload only", step="FEAT")

    feat_df = build_features(combined_df)
    n_feat  = len(feat_df)
    log(f"After feats : {n_feat} rows", step="FEAT")

    # Only keep rows corresponding to the new upload timestamps
    new_df["_dt"] = pd.to_datetime(new_df["Start time UTC"], utc=True)
    new_ts_set = set(new_df["_dt"].dropna())
    feat_df["_dt_check"] = pd.to_datetime(feat_df["datetime"], utc=True)
    feat_new = feat_df[feat_df["_dt_check"].isin(new_ts_set)].copy()
    n_new = len(feat_new)
    log(f"New rows for training : {n_new} (from upload)", step="FEAT")

    # Fall back to full combined set if no new rows matched (e.g. small upload)
    if n_new < 2:
        log("Too few new-only rows — training on full combined feature set", step="FEAT")
        feat_new = feat_df

    n_feat = len(feat_new)
    feat_df = feat_new

    if n_feat < 2:
        raise ValueError(
            f"Only {n_feat} usable row(s) after feature engineering. "
            "Need at least 2 rows to create even 1 training sequence."
        )

    # Adaptive window: shrink for small uploads so they always produce sequences
    window = min(FULL_WINDOW, n_feat - 1)
    if window < FULL_WINDOW:
        log(f"⚠ Small upload ({n_feat} rows) — adaptive window: {window} (normal={FULL_WINDOW})", step="FEAT")
    else:
        log(f"Window size : {window}", step="FEAT")

    # ── 3. Scale & build sequences ───────────────────────────────────────────
    section("STEP 3/7 · Scaling & sequencing")
    X_raw    = feat_df[FEATURE_COLS].values
    y_raw    = feat_df[TARGET_COL].values

    X_scaled = scaler_X.transform(X_raw)
    y_scaled = scaler_y.transform(y_raw.reshape(-1, 1)).ravel()
    log("✓ Data scaled", step="SCALE")

    X_seq, y_seq = make_sequences(X_scaled, y_scaled, window)
    n_seq = len(X_seq)
    log(f"Sequences   : {n_seq}  (shape {X_seq.shape})", step="SCALE")

    if n_seq == 0:
        raise ValueError("No sequences generated — upload more rows of data.")

    dataset    = TensorDataset(torch.from_numpy(X_seq), torch.from_numpy(y_seq))
    dataloader = DataLoader(dataset, batch_size=min(batch_size, n_seq), shuffle=True)
    n_batches  = len(dataloader)
    log(f"Batches/epoch: {n_batches}", step="SCALE")

    # ── 4. Fine-tune TCN ─────────────────────────────────────────────────────
    section("STEP 4/7 · Fine-tuning TCN")

    if freeze_backbone:
        # Freeze all backbone layers — only train the final linear head
        for name, param in model.named_parameters():
            param.requires_grad = name.startswith("head.")
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        log(f"Backbone frozen — trainable params: {trainable:,} (head only)", step="TCN")
    else:
        trainable = sum(p.numel() for p in model.parameters())
        log(f"Full model trainable — params: {trainable:,}", step="TCN")

    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr, weight_decay=1e-5
    )
    loss_fn = nn.HuberLoss()
    model.train()

    for epoch in range(1, epochs + 1):
        epoch_loss = 0.0
        log(f"Epoch {epoch}/{epochs} starting…", step="TCN")
        for b_idx, (Xb, yb) in enumerate(dataloader, 1):
            Xb, yb = Xb.to(device), yb.to(device)
            optimizer.zero_grad()
            pred = model(Xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            epoch_loss += loss.item() * len(Xb)
            # Log every batch (important for small datasets where 1 epoch = 1 batch)
            log(f"  batch {b_idx}/{n_batches}  loss={loss.item():.6f}", step="TCN")

        avg = epoch_loss / n_seq
        log(f"Epoch {epoch}/{epochs} done — avg HuberLoss: {avg:.6f}", step="TCN")

    # ── 5. XGB residual corrector ─────────────────────────────────────────────
    section("STEP 5/7 · Updating XGB residual corrector")
    model.eval()
    with torch.no_grad():
        tcn_preds_scaled = model(torch.from_numpy(X_seq).to(device)).cpu().numpy()

    tcn_preds = scaler_y.inverse_transform(tcn_preds_scaled.reshape(-1, 1)).ravel()
    y_actual  = scaler_y.inverse_transform(y_seq.reshape(-1, 1)).ravel()
    residuals = y_actual - tcn_preds
    log(f"Residuals   : mean={residuals.mean():.3f}  std={residuals.std():.3f}", step="XGB")

    new_xgb_path = parent_dir / "final_prefix_xgb_corrector.json"

    if HAS_XGB and n_seq >= 3:   # XGB needs at least a few samples
        xgb_model = xgb.XGBRegressor(
            n_estimators   = xgb_trees,   # 30 trees — fast
            max_depth      = 3,            # shallow → fast + no overfit on small data
            learning_rate  = 0.1,
            subsample      = 0.8,
            tree_method    = "hist",
            verbosity      = 0,
        )
        X_for_xgb = X_raw[window:]
        log(f"Fitting XGB on {len(X_for_xgb)} samples, {xgb_trees} trees…", step="XGB")
        xgb_model.fit(X_for_xgb, residuals)
        xgb_model.save_model(str(new_xgb_path))
        log(f"✓ XGB saved → {new_xgb_path.name}", step="XGB")
        xgb_correction = xgb_model.predict(X_for_xgb)
        final_preds    = tcn_preds + xgb_correction
    else:
        if not HAS_XGB:
            log("xgboost not installed — copying parent XGB unchanged.", step="XGB")
        else:
            log(f"Too few sequences ({n_seq}) for XGB — copying parent unchanged.", step="XGB")
        if xgb_path.exists() and xgb_path != new_xgb_path:
            shutil.copy(xgb_path, new_xgb_path)
        final_preds = tcn_preds

    # ── 6. Evaluate ───────────────────────────────────────────────────────────
    section("STEP 6/7 · Saving artefacts")
    nonzero = y_actual != 0
    mape = float(
        np.mean(np.abs((y_actual[nonzero] - final_preds[nonzero]) / y_actual[nonzero])) * 100
    ) if nonzero.any() else 0.0
    log(f"MAPE on new data: {mape:.2f}%", step="EVAL")

    # Save to version_dir — each version gets its own complete set of artefacts
    new_tcn_path  = version_dir / "final_prefix_tcn_weights.pth"
    new_sX_path   = version_dir / "final_prefix_scaler_X.pkl"
    new_sy_path   = version_dir / "final_prefix_scaler_y.pkl"
    new_meta_path = version_dir / "final_prefix_metadata.json"

    torch.save(model.state_dict(), new_tcn_path)
    log(f"✓ TCN weights → {new_tcn_path.name}", step="SAVE")

    with open(new_sX_path, "wb") as f:
        pickle.dump(scaler_X, f, protocol=4)
    with open(new_sy_path, "wb") as f:
        pickle.dump(scaler_y, f, protocol=4)
    log("✓ Scalers saved", step="SAVE")

    metadata = {
        "features":       FEATURE_COLS,
        "target":         TARGET_COL,
        "window_size":    window,
        "mape_achieved":  f"{mape:.2f}%",
        "parent_version": parent_version,
        "trained_on":     str(data_path),
        "trained_at":     datetime.now(timezone.utc).isoformat(),
        "epochs":         epochs,
        "n_sequences":    n_seq,
        "freeze_backbone": freeze_backbone,
        "xgb_trees":      xgb_trees,
        "device":         str(device),
    }
    new_meta_path.write_text(json.dumps(metadata, indent=2))
    log(f"✓ Metadata saved → {new_meta_path.name}", step="SAVE")

    # Also update final_submission/ so the NEXT retrain loads these latest weights
    for src in [new_tcn_path, new_sX_path, new_sy_path, new_xgb_path, new_meta_path]:
        shutil.copy(src, parent_dir / src.name)
    log("✓ Artefacts promoted to final_submission/", step="SAVE")

    # ── 7. Update registry ────────────────────────────────────────────────────
    section("STEP 7/7 · Updating registry")
    with open(registry_path) as f:
        registry = json.load(f)

    registry["active_version"] = new_version
    registry["versions"][new_version] = {
        "created_at":    datetime.now(timezone.utc).isoformat(),
        "parent":        parent_version,
        "data_file":     str(data_path),
        "mape":          f"{mape:.2f}%",
        "job_id":        job_id,
        "artefact_dir":  str(parent_dir),
        "n_sequences":   n_seq,
    }
    tmp = registry_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(registry, indent=4))
    tmp.replace(registry_path)
    log(f"✓ Registry updated. Active version: {new_version}", step="REG")

    elapsed_total = time.monotonic() - _t0
    section(f"  DONE  ({elapsed_total:.1f}s total)")
    log(f"{parent_version} → {new_version}  |  MAPE {mape:.2f}%  |  {n_seq} sequences")

    write_job_status(version_dir, "done", {
        "job_id":    job_id,
        "mape":      f"{mape:.2f}%",
        "elapsed_s": round(elapsed_total, 2),
        "artefacts": [
            str(new_tcn_path), str(new_xgb_path),
            str(new_sX_path),  str(new_sy_path), str(new_meta_path),
        ],
    })


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Prometheus fast incremental retrain")
    p.add_argument("--job-id",          required=True)
    p.add_argument("--data-path",       required=True)
    p.add_argument("--new-version",     required=True)
    p.add_argument("--parent-version",  required=True)
    p.add_argument("--model-dir",       required=True)
    p.add_argument("--registry-path",   required=True)
    p.add_argument("--epochs",          type=int,   default=2)
    p.add_argument("--batch-size",      type=int,   default=32)
    p.add_argument("--lr",              type=float, default=5e-5)
    p.add_argument("--xgb-trees",       type=int,   default=30)
    p.add_argument("--no-freeze",       action="store_true",
                   help="Unfreeze full TCN backbone (slower, for large data)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    version_dir = Path(args.model_dir) / args.new_version
    version_dir.mkdir(parents=True, exist_ok=True)

    log(f"🚀 Prometheus retrain started  job={args.job_id}")
    log(f"   new={args.new_version}  parent={args.parent_version}")
    log(f"   epochs={args.epochs}  batch={args.batch_size}  lr={args.lr}  xgb_trees={args.xgb_trees}")
    log(f"   freeze_backbone={not args.no_freeze}")

    try:
        retrain(
            job_id          = args.job_id,
            data_path       = Path(args.data_path),
            new_version     = args.new_version,
            parent_version  = args.parent_version,
            model_dir       = Path(args.model_dir),
            registry_path   = Path(args.registry_path),
            epochs          = args.epochs,
            batch_size      = args.batch_size,
            lr              = args.lr,
            freeze_backbone = not args.no_freeze,
            xgb_trees       = args.xgb_trees,
        )
        sys.exit(0)
    except Exception:
        log("❌ Retrain FAILED:")
        traceback.print_exc()
        write_job_status(version_dir, "failed", {"error": traceback.format_exc()})
        sys.exit(1)
