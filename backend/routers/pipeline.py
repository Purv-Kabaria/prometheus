"""
pipeline.py — FastAPI router for the Prometheus ML Pipeline.

Responsibilities:
  1. Accept CSV uploads, validate field names & timestamp continuity.
  2. Merge validated data into the gold-standard store.
  3. Spawn retrain.py as a child process (asyncio.create_subprocess_exec).
     → FastAPI stays 100 % non-blocking; training gets a real OS process
       with its own memory + CPU core.
  4. Expose job-status & model-registry endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Router & path constants
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/pipeline", tags=["ML Pipeline"])

logger = logging.getLogger(__name__)

BASE_DIR      = Path(__file__).resolve().parent.parent   # …/backend


def _enrich_anomaly_llm_task(anomaly_ids: list) -> None:
    try:
        from anomaly_pipeline import enrich_anomalies_llm

        enrich_anomalies_llm(anomaly_ids)
    except Exception:
        logger.exception("Background LLM anomaly enrich failed")


REGISTRY_PATH = BASE_DIR / "models" / "registry.json"
DATA_STORE    = BASE_DIR / "data" / "gold_standard.csv"
MODEL_DIR     = BASE_DIR / "models"
UPLOAD_DIR    = BASE_DIR / "data" / "uploads"
RETRAIN_SCRIPT = BASE_DIR / "scripts" / "retrain.py"

# In-memory job tracker  {job_id → job_dict}
# Each entry:  {"job_id", "version", "pid", "status", "started_at", "log_path"}
JOBS: Dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Required columns & expected hourly cadence
# ---------------------------------------------------------------------------
REQUIRED_COLS = ["Start time UTC", "End time UTC", "Electricity consumption (MWh)"]
EXPECTED_FREQ = timedelta(hours=1)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class ActivateVersionRequest(BaseModel):
    version: str
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper: load & save registry (atomic via temp-file rename)
# ---------------------------------------------------------------------------
def _load_registry() -> dict:
    with open(REGISTRY_PATH) as f:
        return json.load(f)


def _save_registry(reg: dict) -> None:
    tmp = REGISTRY_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(reg, f, indent=4)
    tmp.replace(REGISTRY_PATH)   # atomic on POSIX; near-atomic on Windows


# ---------------------------------------------------------------------------
# Validation & merge logic
# ---------------------------------------------------------------------------
def validate_and_merge(new_df: pd.DataFrame) -> pd.DataFrame:
    """
    1. Check required column names exist.
    2. Parse & sort timestamps.
    3. Verify internal gaps within the new file itself.
    4. Verify continuity against the existing gold-standard store.
    5. Concat + dedup → write back.
    """
    # --- 1. Column validation ---
    missing = [c for c in REQUIRED_COLS if c not in new_df.columns]
    if missing:
        raise ValueError(
            f"Missing required columns: {missing}. "
            f"File must contain exactly: {REQUIRED_COLS}"
        )

    # --- 2. Parse timestamps ---
    try:
        new_df = new_df.copy()
        new_df["_dt"] = pd.to_datetime(new_df["Start time UTC"], utc=True)
    except Exception as exc:
        raise ValueError(f"Could not parse 'Start time UTC' as datetime: {exc}") from exc

    new_df = new_df.sort_values("_dt").reset_index(drop=True)

    # --- 3. Internal gap check ---
    if len(new_df) > 1:
        diffs = new_df["_dt"].diff().dropna()
        bad = diffs[diffs != EXPECTED_FREQ]
        if not bad.empty:
            idx = bad.index[0]
            raise ValueError(
                f"Internal gap/overlap at row {idx}: "
                f"expected {EXPECTED_FREQ}, got {diffs[idx]}. "
                f"Timestamps: {new_df['_dt'][idx-1]} → {new_df['_dt'][idx]}"
            )

    # --- 4. Continuity against existing store ---
    if DATA_STORE.exists():
        existing_df = pd.read_csv(DATA_STORE)
        existing_df["_dt"] = pd.to_datetime(existing_df["Start time UTC"], utc=True)
        last_ts  = existing_df["_dt"].max()
        first_new = new_df["_dt"].min()
        gap = first_new - last_ts

        if gap > EXPECTED_FREQ:
            raise ValueError(
                f"Gap detected! Existing data ends at {last_ts}, "
                f"new data starts at {first_new} "
                f"(gap = {gap}). Expected ≤ {EXPECTED_FREQ}."
            )
        if gap < timedelta(0):
            raise ValueError(
                f"Overlap detected! New data starts at {first_new} which is "
                f"before the last existing timestamp {last_ts}."
            )
        if gap < EXPECTED_FREQ and gap > timedelta(0):
            raise ValueError(
                f"Partial overlap: new data starts {gap} before the expected "
                f"next slot ({last_ts + EXPECTED_FREQ})."
            )

        merged = (
            pd.concat([existing_df, new_df])
            .drop_duplicates(subset=["_dt"])
            .sort_values("_dt")
        )
    else:
        merged = new_df

    # --- 5. Persist ---
    merged.drop(columns=["_dt"]).to_csv(DATA_STORE, index=False)
    return merged


# ---------------------------------------------------------------------------
# Subprocess launcher — the key piece
# ---------------------------------------------------------------------------
async def _spawn_retrain(job_id: str, data_path: str, new_version: str, parent_version: str) -> None:
    """
    Launches retrain.py as a child process via asyncio.create_subprocess_exec.
    This is fire-and-monitor: FastAPI is never blocked.
    """
    log_path = MODEL_DIR / new_version / "train.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,           # same venv Python
        str(RETRAIN_SCRIPT),
        "--job-id",         job_id,
        "--data-path",      data_path,
        "--new-version",    new_version,
        "--parent-version", parent_version,
        "--model-dir",      str(MODEL_DIR),
        "--registry-path",  str(REGISTRY_PATH),
        "--epochs",         "2",     # fast fine-tune: 2 epochs
        "--batch-size",     "32",
        "--lr",             "5e-5",  # conservative warm-start LR
        "--xgb-trees",      "30",    # lightweight residual patch
        # add --no-freeze here if you want full backbone training
    ]

    JOBS[job_id]["status"] = "running"

    log_fh = open(log_path, "w")
    proc = subprocess.Popen(
        cmd,
        stdout=log_fh,
        stderr=subprocess.STDOUT,   # merge stderr into same log
    )
    JOBS[job_id]["pid"] = proc.pid
    JOBS[job_id]["log_path"] = str(log_path)

    # Wait in background — still non-blocking for the event loop using to_thread
    def wait_proc():
        return proc.wait()

    return_code = await asyncio.to_thread(wait_proc)
    log_fh.close()

    if return_code == 0:
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
    else:
        JOBS[job_id]["status"] = "failed"
        JOBS[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
        JOBS[job_id]["return_code"] = return_code


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload", summary="Upload new CSV, validate, merge & trigger retrain")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    1. Validate filename ends with .csv
    2. Parse & validate columns + timestamp continuity
    3. Merge into gold_standard.csv
    4. Spawn retrain.py as a child process (returns immediately)
    5. Returns a job_id to poll /status/{job_id}
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

    # Save upload
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}_{file.filename}"
    temp_path = UPLOAD_DIR / safe_name
    with open(temp_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    new_ids: list = []
    # Validate & merge (synchronous — fast, IO-bound)
    try:
        df = pd.read_csv(temp_path)
        merged = validate_and_merge(df)
        try:
            from anomaly_pipeline import run_post_ingest_anomaly_scan

            new_ids = run_post_ingest_anomaly_scan(
                df, merged, file.filename, use_llm_scan=False
            )
            if new_ids:
                logger.info("Ingestion anomaly scan logged %s event(s)", len(new_ids))
        except Exception:
            logger.exception("Post-ingest anomaly scan failed")
    except ValueError as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Processing error: {exc}")

    # Determine next version
    registry = _load_registry()
    parent_v = registry["active_version"]
    new_v = f"v{int(parent_v[1:]) + 1}"

    # Register job
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "job_id":     job_id,
        "version":    new_v,
        "parent":     parent_v,
        "status":     "pending",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "data_file":  str(temp_path),
        "rows_merged": len(merged),
    }

    # Launch child process via background task wrapper
    background_tasks.add_task(
        _spawn_retrain, job_id, str(temp_path), new_v, parent_v
    )
    if new_ids:
        background_tasks.add_task(_enrich_anomaly_llm_task, new_ids)

    return {
        "message":     "File validated and merged. Retraining triggered.",
        "filename":    file.filename,
        "rows_merged": len(merged),
        "new_version": new_v,
        "job_id":      job_id,
        "poll_status": f"/pipeline/status/{job_id}",
        "anomalies_detected": len(new_ids),
    }


@router.get("/status/{job_id}", summary="Poll training job status")
def get_job_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found.")
    job = JOBS[job_id]
    response = dict(job)

    # Also surface the last few lines of the log for quick debugging
    log_path = job.get("log_path")
    if log_path and Path(log_path).exists():
        with open(log_path) as lf:
            lines = lf.readlines()
        response["log_tail"] = "".join(lines[-30:])

    return response


@router.get("/jobs", summary="List all training jobs this session")
def list_jobs():
    return {"jobs": list(JOBS.values())}


@router.get("/registry", summary="Show full model registry")
def get_registry():
    return _load_registry()


@router.put("/registry/activate", summary="Manually switch the active model version")
def activate_version(req: ActivateVersionRequest):
    registry = _load_registry()
    if req.version not in registry["versions"]:
        raise HTTPException(
            status_code=404,
            detail=f"Version '{req.version}' not in registry. "
                   f"Known: {list(registry['versions'].keys())}"
        )
    old_v = registry["active_version"]
    registry["active_version"] = req.version
    registry["versions"][req.version]["activated_at"] = datetime.now(timezone.utc).isoformat()
    if req.reason:
        registry["versions"][req.version]["activation_reason"] = req.reason
    _save_registry(registry)
    return {
        "message":       f"Active version switched from {old_v} → {req.version}",
        "active_version": req.version,
    }


@router.get("/registry/{version}", summary="Details for a single version")
def get_version_detail(version: str):
    registry = _load_registry()
    if version not in registry["versions"]:
        raise HTTPException(status_code=404, detail=f"Version '{version}' not found.")
    return {
        "version":  version,
        "is_active": registry["active_version"] == version,
        **registry["versions"][version],
    }