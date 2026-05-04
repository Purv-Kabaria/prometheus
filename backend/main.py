import logging
import warnings
warnings.filterwarnings("ignore")
import os
import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

# ── Routers ───────────────────────────────────────────────────────────────────
try:
    from routers.agent import router as agent_router
except Exception:
    agent_router = None
from routers.forecast import router as forecast_router
from routers.anomalies import router as anomalies_router
# New Pipeline router from upstream
from routers import pipeline as pipeline_router
# Operational Intelligence routers
from routers.live import router as live_router
from routers.performance import router as performance_router
from routers.reports import router as reports_router
from routers.history import router as history_router
from routers.ember import router as ember_router

# DB init
from services.storage import init_db

# ── Suppress repetitive status-poll noise from uvicorn access log ────────────
class _SuppressStatusPoll(logging.Filter):
    """Drop GET /pipeline/status/... lines so real logs stay visible."""
    def filter(self, record: logging.LogRecord) -> bool:
        return "GET /pipeline/status/" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_SuppressStatusPoll())
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Prometheus Grid API",
    description="ML Pipeline & Operational Intelligence for Grid Operators",
    version="2.1.0",
)

# Ensure local directories exist
os.makedirs("data/uploads", exist_ok=True)
os.makedirs("models/final_submission", exist_ok=True)

# Initialize Registry if not exists
if not os.path.exists("models/registry.json"):
    with open("models/registry.json", "w") as f:
        json.dump({
            "active_version": "v1",
            "versions": {
                "v1": {
                    "created_at":   "initial",
                    "parent":       None,
                    "artefact_dir": "models/final_submission",
                    "mape":         "1.54%",
                    "note":         "Original submission model",
                    "activated_at": datetime.now(timezone.utc).isoformat(),
                }
            }
        }, f, indent=4)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Include All Routers ──────────────────────────────────────────────────────
if agent_router is not None:
    app.include_router(agent_router)
# Triggering reload again
app.include_router(forecast_router)
app.include_router(anomalies_router)
app.include_router(pipeline_router.router)
app.include_router(live_router)
app.include_router(performance_router)
app.include_router(reports_router)
app.include_router(history_router)
app.include_router(ember_router)


@app.on_event("startup")
async def startup_event():
    init_db()
    print("Prometheus API started - DB initialized.")


@app.get("/")
def root():
    return {
        "status": "Prometheus API is running",
        "modules": ["Agent", "Forecasting", "Anomalies", "Pipeline", "Operational Intelligence"],
        "version": "2.1.0"
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
