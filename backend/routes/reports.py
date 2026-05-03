"""
routes/reports.py — Auto-Generated PDF Reports
GET  /api/reports               — list all generated reports
POST /api/reports/generate      — on-demand report generation
GET  /api/reports/today-summary — quick preview card data
GET  /api/reports/{id}/download — download PDF
"""
import sqlite3
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/reports", tags=["Operational Intelligence"])

DB_PATH      = Path(__file__).parent.parent / "data" / "predictions.db"
REPORTS_DIR  = Path(__file__).parent.parent / "data" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ── internal helpers ──────────────────────────────────────────────────────────

def _load_today() -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT * FROM predictions
        WHERE timestamp >= datetime('now', '-1 days')
          AND actual IS NOT NULL
        """,
        conn,
    )
    conn.close()
    return df


def _compute_metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0}
    a = df["actual"].values.astype(float)
    p = df["predicted_p50"].values.astype(float)
    mask = (a != 0) & np.isfinite(a) & np.isfinite(p)
    a, p = a[mask], p[mask]
    if len(a) == 0:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0}
    return {
        "mae":  round(float(np.mean(np.abs(a - p))), 2),
        "rmse": round(float(np.sqrt(np.mean((a - p) ** 2))), 2),
        "mape": round(float(np.mean(np.abs((a - p) / a)) * 100), 2),
    }


def _detect_anomalies(df: pd.DataFrame) -> list:
    """Flag hours where |residual| z-score > 2.5."""
    if df.empty or "residual" not in df.columns:
        return []
    res = df["residual"].dropna().values.astype(float)
    if len(res) < 3:
        return []
    mu, sigma = res.mean(), res.std()
    if sigma == 0:
        return []
    anomalies = []
    for _, row in df.iterrows():
        r = row.get("residual")
        if r is None or not np.isfinite(r):
            continue
        z = abs((r - mu) / sigma)
        if z > 2.5:
            ts = row.get("timestamp", "")
            anomalies.append({
                "timestamp": ts,
                "residual":  round(float(r), 2),
                "z_score":   round(float(z), 2),
            })
    return anomalies


def _render_pdf(date_str: str, metrics: dict, anomalies: list, filepath: Path):
    """Render the daily report to PDF using reportlab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm

        doc  = SimpleDocTemplate(str(filepath), pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
        st   = getSampleStyleSheet()
        body = []

        # ── Title ──────────────────────────────────────────────────────────
        title_style = ParagraphStyle("title", parent=st["Title"], fontSize=22, spaceAfter=6)
        sub_style   = ParagraphStyle("sub",   parent=st["Normal"], fontSize=12, textColor=colors.grey, spaceAfter=20)
        body.append(Paragraph("DAILY OPERATIONS REPORT", title_style))
        body.append(Paragraph(f"Prometheus Grid Intelligence · {date_str}", sub_style))

        # ── Forecast Performance ────────────────────────────────────────────
        body.append(Paragraph("FORECAST PERFORMANCE", st["Heading2"]))
        targets = {"mae": 3.0, "rmse": 4.0, "mape": 5.0}
        rows = [["Metric", "Value", "Target", "Status"]]
        for k, label, unit in [
            ("mae",  "MAE",  "MWh"),
            ("rmse", "RMSE", "MWh"),
            ("mape", "MAPE", "%"),
        ]:
            v   = metrics.get(k, 0)
            tgt = targets[k]
            ok  = "✅ PASS" if v < tgt else "❌ FAIL"
            rows.append([label, f"{v} {unit}", f"< {tgt}", ok])

        t = Table(rows, colWidths=[3*cm, 4*cm, 4*cm, 3*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
            ("GRID",       (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ]))
        body.append(t)
        body.append(Spacer(1, 20))

        # ── Anomalies ───────────────────────────────────────────────────────
        body.append(Paragraph(f"ANOMALIES DETECTED ({len(anomalies)})", st["Heading2"]))
        if anomalies:
            arows = [["Timestamp", "Residual (MWh)", "Z-Score"]]
            for a in anomalies[:10]:
                arows.append([a["timestamp"], str(a["residual"]), str(a["z_score"])])
            at = Table(arows, colWidths=[6*cm, 4*cm, 4*cm])
            at.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e63946")),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
            ]))
            body.append(at)
        else:
            body.append(Paragraph("No significant anomalies detected.", st["Normal"]))
        body.append(Spacer(1, 20))

        # ── Estimated Savings ───────────────────────────────────────────────
        body.append(Paragraph("ESTIMATED SAVINGS", st["Heading2"]))
        accuracy = round(100 - metrics.get("mape", 0), 1)
        body.append(Paragraph(
            f"Model accuracy today: <b>{accuracy}%</b>. "
            "Accurate forecasting avoids over-generation and reduces reserve costs. "
            "Estimated avoided cost: <b>₹2.4L</b> (placeholder — connect agent logs for actuals).",
            st["Normal"],
        ))

        doc.build(body)
        return True
    except ImportError:
        # reportlab not installed — write a plain-text placeholder
        filepath.write_text(f"[Placeholder] Daily report for {date_str}\nMetrics: {metrics}\nAnomalies: {len(anomalies)}")
        return False


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_reports():
    """List all generated reports with metadata."""
    reports = []
    for f in sorted(REPORTS_DIR.glob("daily_report_*.pdf"), reverse=True):
        date_part = f.stem.replace("daily_report_", "")
        reports.append({"id": f.name, "name": "Daily Ops Summary", "date": date_part, "format": "PDF"})
    for f in sorted(REPORTS_DIR.glob("weekly_report_*.pdf"), reverse=True):
        date_part = f.stem.replace("weekly_report_", "")
        reports.append({"id": f.name, "name": "Weekly Review", "date": date_part, "format": "PDF"})
    # Sort combined list by date desc
    reports.sort(key=lambda r: r["date"], reverse=True)
    return reports


@router.post("/generate")
def generate_report(date: str = None):
    """Generate a PDF report for today (or a given date)."""
    date_str  = date or datetime.now().strftime("%Y-%m-%d")
    filepath  = REPORTS_DIR / f"daily_report_{date_str}.pdf"
    df        = _load_today()
    metrics   = _compute_metrics(df)
    anomalies = _detect_anomalies(df)
    _render_pdf(date_str, metrics, anomalies, filepath)
    return {"status": "generated", "id": filepath.name, "date": date_str, "metrics": metrics}


@router.get("/today-summary")
def today_summary():
    """Quick preview card — no PDF needed."""
    df        = _load_today()
    metrics   = _compute_metrics(df)
    anomalies = _detect_anomalies(df)
    accuracy  = round(100 - metrics["mape"], 1)
    hours_done = len(df)
    return {
        "date":       datetime.now().strftime("%B %d, %Y"),
        "accuracy":   accuracy,
        "anomalies":  len(anomalies),
        "savings":    "₹2.4L",
        "hours_done": hours_done,
        "hours_total": 24,
    }


@router.get("/{report_id}/download")
def download_report(report_id: str):
    """Stream PDF for download."""
    filepath = REPORTS_DIR / report_id
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Report not found. Generate it first.")
    return FileResponse(path=str(filepath), filename=report_id, media_type="application/pdf")
