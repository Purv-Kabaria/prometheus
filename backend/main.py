from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers import agent, pipeline
import os
import json
import logging
from datetime import datetime, timezone

# ── Suppress repetitive status-poll noise from uvicorn access log ────────────
class _SuppressStatusPoll(logging.Filter):
    """Drop GET /pipeline/status/... lines so real logs stay visible."""
    def filter(self, record: logging.LogRecord) -> bool:
        return "GET /pipeline/status/" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_SuppressStatusPoll())
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Prometheus Grid API",
    description="ML pipeline + grid agent for Adani Prometheus hackathon",
    version="1.0.0",
)

# Ensure local directories exist
os.makedirs("data/uploads", exist_ok=True)
os.makedirs("models/final_submission", exist_ok=True)

# Initialize Registry if not exists
# v1 = the original trained model living in models/final_submission/
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

app.include_router(agent.router)
app.include_router(pipeline.router)

@app.get("/")
def read_root():
    return {"status": "Prometheus API is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)