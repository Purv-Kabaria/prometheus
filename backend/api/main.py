from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys

# Add the backend directory to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routes import agent, forecast, live, reports, performance
from services.storage import init_db

app = FastAPI(title="Prometheus Grid API - Operational Intelligence")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(agent.router)
app.include_router(forecast.router)
app.include_router(live.router)
app.include_router(reports.router)
app.include_router(performance.router)

@app.on_event("startup")
async def startup_event():
    init_db()
    # Optional: trigger a backfill if needed
    print("Database initialized.")

@app.get("/")
def read_root():
    return {"status": "Prometheus Operational Intelligence API is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
