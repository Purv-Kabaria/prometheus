from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_BACKEND = Path(__file__).resolve().parent
DATA_DIR = _BACKEND / "data"
ANOMALIES_PATH = DATA_DIR / "anomalies_log.json"
GOLD_PATH = DATA_DIR / "gold_standard.csv"

Z_THRESHOLD_MEDIUM = 2.5
Z_THRESHOLD_HIGH = 3.5
ROLLBACK = 168
MIN_PRIOR = 12


def _ollama_config() -> tuple[str, str]:
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b").strip()
    return host, model


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_anomaly_log() -> List[Dict[str, Any]]:
    if not ANOMALIES_PATH.exists():
        return []
    try:
        raw = ANOMALIES_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("Failed to read anomaly log: %s", exc)
        return []


def save_anomaly_log(entries: List[Dict[str, Any]]) -> None:
    _atomic_write_json(ANOMALIES_PATH, entries)


def _existing_keys(entries: List[Dict[str, Any]]) -> set:
    return {(e.get("timestamp_utc"), e.get("kind")) for e in entries}


def _severity(z: float) -> str:
    a = abs(z)
    if a >= Z_THRESHOLD_HIGH:
        return "high"
    if a >= Z_THRESHOLD_MEDIUM:
        return "medium"
    return "low"


def _detect_rows(
    merged_idx: pd.DataFrame,
    new_ts: pd.Series,
    upload_filename: str,
) -> List[Dict[str, Any]]:
    col = "Electricity consumption (MWh)"
    if col not in merged_idx.columns:
        return []

    ts_col = "_dt"
    if ts_col not in merged_idx.columns:
        return []

    merged_idx = merged_idx.sort_values(ts_col).reset_index(drop=True)
    values = merged_idx[col].astype(float).values

    series_utc = pd.to_datetime(merged_idx[ts_col], utc=True)

    def pos_for(t) -> int:
        tt = pd.Timestamp(t)
        if tt.tzinfo is None:
            tt = tt.tz_localize("UTC")
        else:
            tt = tt.tz_convert("UTC")
        w = np.where(series_utc == tt)[0]
        if len(w) == 0:
            return -1
        return int(w[-1])

    out: List[Dict[str, Any]] = []
    for raw_t in new_ts.dropna().unique():
        pos = pos_for(raw_t)
        if pos < 0:
            continue
        prior = values[max(0, pos - ROLLBACK) : pos]
        if len(prior) < MIN_PRIOR:
            continue
        mean = float(np.mean(prior))
        std = float(np.std(prior)) or 1e-9
        val = float(values[pos])
        z = (val - mean) / std
        if abs(z) < Z_THRESHOLD_MEDIUM:
            continue
        kind = "spike" if z > 0 else "dip"
        cell = pd.Timestamp(merged_idx.iloc[pos][ts_col])
        if cell.tzinfo is None:
            cell = cell.tz_localize("UTC")
        else:
            cell = cell.tz_convert("UTC")
        ts_iso = cell.strftime("%Y-%m-%dT%H:%M:%SZ")
        out.append(
            {
                "id": str(uuid.uuid4()),
                "timestamp_utc": ts_iso,
                "consumption_mwh": round(val, 4),
                "baseline_mwh": round(mean, 4),
                "delta_mwh": round(val - mean, 4),
                "z_score": round(float(z), 4),
                "severity": _severity(z),
                "kind": kind,
                "source": "ingestion_upload",
                "upload_filename": upload_filename,
                "stat_method": f"rolling_{ROLLBACK}h_zscore",
                "llm_scan_note": None,
                "explanation": None,
                "explained_at": None,
                "acknowledged": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return out


def llm_batch_scan_notes(records: List[Dict[str, Any]]) -> None:
    if not records:
        return
    base, model = _ollama_config()
    try:
        from langchain_community.chat_models import ChatOllama
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
    except Exception as exc:
        logger.warning("LangChain not available for batch scan: %s", exc)
        return

    lines = []
    for i, r in enumerate(records):
        lines.append(
            f"{i + 1}. time={r['timestamp_utc']} kind={r['kind']} MWh={r['consumption_mwh']} "
            f"baseline≈{r['baseline_mwh']} z={r['z_score']}"
        )
    body = "\n".join(lines)
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are an energy systems analyst. For each numbered anomaly, reply with one short sentence "
                "(max 30 words) on a plausible operational or data cause. Output ONLY valid JSON: "
                '{{"notes": ["sentence1", "sentence2", ...]}} with the same count and order as the input lines.',
            ),
            ("human", "{anomalies}"),
        ]
    )
    try:
        llm = ChatOllama(model=model, base_url=base, temperature=0.2)
        chain = prompt | llm | StrOutputParser()
        text = chain.invoke({"anomalies": body})
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            return
        parsed = json.loads(text[start:end])
        notes = parsed.get("notes") if isinstance(parsed, dict) else None
        if not isinstance(notes, list):
            return
        for i, r in enumerate(records):
            if i < len(notes) and isinstance(notes[i], str):
                r["llm_scan_note"] = notes[i].strip()
    except Exception as exc:
        logger.warning("LLM batch scan failed: %s", exc)


def run_post_ingest_anomaly_scan(
    new_df: pd.DataFrame,
    merged_df: pd.DataFrame,
    upload_filename: str,
    use_llm_scan: bool = True,
) -> List[str]:
    if merged_df is None or len(merged_df) == 0:
        return []

    work = merged_df.copy()
    if "_dt" not in work.columns:
        work["_dt"] = pd.to_datetime(work["Start time UTC"], utc=True)
    work = work.sort_values("_dt").reset_index(drop=True)

    nd = new_df.copy()
    nd["_dt"] = pd.to_datetime(nd["Start time UTC"], utc=True)

    detected = _detect_rows(work, nd["_dt"], upload_filename)
    if not detected:
        return []

    log = load_anomaly_log()
    seen = _existing_keys(log)
    fresh: List[Dict[str, Any]] = []
    for r in detected:
        key = (r["timestamp_utc"], r["kind"])
        if key in seen:
            continue
        seen.add(key)
        fresh.append(r)

    if not fresh:
        return []

    if use_llm_scan:
        llm_batch_scan_notes(fresh)

    log.extend(fresh)
    save_anomaly_log(log)
    return [r["id"] for r in fresh]


def enrich_anomalies_llm(anomaly_ids: List[str]) -> None:
    if not anomaly_ids:
        return
    log = load_anomaly_log()
    want = set(anomaly_ids)
    batch = [x for x in log if x.get("id") in want]
    if not batch:
        return
    llm_batch_scan_notes(batch)
    save_anomaly_log(log)


def load_gold_tail(n: int = 500) -> pd.DataFrame:
    if not GOLD_PATH.exists():
        return pd.DataFrame()
    df = pd.read_csv(GOLD_PATH)
    if len(df) > n:
        df = df.iloc[-n:].copy()
    df["_dt"] = pd.to_datetime(df["Start time UTC"], utc=True)
    return df.sort_values("_dt").reset_index(drop=True)


def neighbor_context(timestamp_utc: str, before: int = 24, after: int = 6) -> str:
    df = load_gold_tail(max(ROLLBACK * 4, before + after + 80))
    if df.empty:
        return ""
    ts = pd.Timestamp(timestamp_utc)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    df["_ts"] = pd.to_datetime(df["_dt"], utc=True)
    mask = (df["_ts"] >= ts - pd.Timedelta(hours=before)) & (df["_ts"] <= ts + pd.Timedelta(hours=after))
    sl = df.loc[mask, ["_ts", "Electricity consumption (MWh)"]].copy()
    lines = []
    for _, row in sl.iterrows():
        lines.append(f"{row['_ts'].strftime('%Y-%m-%d %H:%M')} UTC — {float(row['Electricity consumption (MWh)']):.4f} MWh")
    return "\n".join(lines)


def explain_anomaly_with_llm(record: Dict[str, Any]) -> str:
    base, model = _ollama_config()
    ctx = neighbor_context(record["timestamp_utc"])
    from langchain_community.chat_models import ChatOllama
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You explain electricity demand anomalies to Indian grid and DISCOM operators. "
                "Be precise, cite the z-score and direction (spike vs dip). Mention plausible causes "
                "(weather, industrial load, holiday, data glitch, meter issue) only when consistent with the numbers. "
                "Answer in 3–5 short sentences.",
            ),
            (
                "human",
                "Anomaly record:\n"
                "- Time (UTC): {ts}\n"
                "- Kind: {kind}\n"
                "- Consumption (MWh): {mwh}\n"
                "- Rolling baseline (MWh): {base}\n"
                "- z-score: {z}\n"
                "- Statistical note from ingestion scan: {scan}\n\n"
                "Neighboring hourly observations:\n{ctx}\n\n"
                "Why might this anomaly have occurred?",
            ),
        ]
    )
    llm = ChatOllama(model=model, base_url=base, temperature=0.3)
    chain = prompt | llm | StrOutputParser()
    return chain.invoke(
        {
            "ts": record.get("timestamp_utc", ""),
            "kind": record.get("kind", ""),
            "mwh": record.get("consumption_mwh", ""),
            "base": record.get("baseline_mwh", ""),
            "z": record.get("z_score", ""),
            "scan": record.get("llm_scan_note") or "(none)",
            "ctx": ctx or "(no neighboring rows loaded)",
        }
    )


def update_record(anomaly_id: str, updates: Dict[str, Any]) -> bool:
    log = load_anomaly_log()
    for e in log:
        if e.get("id") == anomaly_id:
            e.update(updates)
            save_anomaly_log(log)
            return True
    return False


def get_record(anomaly_id: str) -> Optional[Dict[str, Any]]:
    for e in load_anomaly_log():
        if e.get("id") == anomaly_id:
            return e
    return None
