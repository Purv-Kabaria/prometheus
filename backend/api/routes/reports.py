from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from services.report_generator import generate_daily_report, list_reports, REPORTS_DIR
from services.storage import get_metrics_for_window
from services.metrics import calculate_metrics
from datetime import datetime

router = APIRouter(prefix="/api/reports", tags=["Operational Intelligence"])

@router.get("")
def get_all_reports():
    """Lists all generated reports with metadata."""
    return list_reports()

@router.post("/generate")
def trigger_report_generation(date: str = None):
    """On-demand report generation."""
    try:
        report = generate_daily_report(date)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}/download")
def download_report(report_id: str):
    """Returns the PDF file for download."""
    filepath = REPORTS_DIR / report_id
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path=filepath, filename=report_id, media_type='application/pdf')

@router.get("/today-summary")
def get_today_summary():
    """Quick summary for the preview card."""
    df = get_metrics_for_window(1)
    metrics = calculate_metrics(df['actual'], df['predicted_p50'])
    
    return {
        "accuracy": round(100 - metrics['mape'], 1),
        "anomalies": 2, # Placeholder for anomaly detection service
        "savings": "₹2.4L", # Placeholder
        "progress": "24/24 hours done",
        "date": datetime.now().strftime("%B %d, %Y")
    }
