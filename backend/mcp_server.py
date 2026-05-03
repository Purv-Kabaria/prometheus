from mcp.server.fastmcp import FastMCP
import json
import random
import sys
import os

# Ensure we can import from local directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import add_proposal

# Initialize the FastMCP server for the Grid Agent
mcp = FastMCP("PrometheusGridAgent")

from routers.forecast import forecast_24h

@mcp.tool()
def get_demand_forecast(hours: int = 24) -> str:
    """Get the hourly demand forecast for the specified number of hours."""
    try:
        # Fetch real predictions from the TCN_XGB/Mamba model router
        forecast_data = forecast_24h(model="tcn_xgb")
        slots = forecast_data.get("slots", [])[:hours]
        p50_forecasts = [slot["p50"] for slot in slots]
        
        return json.dumps({
            "status": "success", 
            "forecast": p50_forecasts, 
            "unit": "MW",
            "source_model": forecast_data.get("model")
        })
    except Exception as e:
        # Fallback if model loading fails
        forecast = [4200 + random.randint(-100, 100) for _ in range(hours)]
        return json.dumps({"status": "fallback", "forecast": forecast, "unit": "MW", "error": str(e)})

@mcp.tool()
def get_committed_generation() -> str:
    """
    Get the current committed power generation broken down by source type.
    Solar output uses real solar physics (sine curve peaking at noon).
    Total demand is derived from the real TCN+XGB forecast.
    """
    try:
        import math as _math
        from datetime import datetime
        now = datetime.now()
        hour = now.hour
        minute = now.minute

        # Get current-hour demand from the real forecast model
        forecast_data = forecast_24h(model="tcn_xgb")
        slots = forecast_data.get("slots", [])
        current_demand = slots[0].get("p50", 13800) if slots else 13800
        peak_mw = forecast_data.get("summary", {}).get("peak_mw", 15000)

        # ── Coal baseload: stable, slightly fluctuates with minute ─────────
        coal_output = round(6000 * 0.85 + (minute % 15) * 2)

        # ── Solar: physically real — zero at night, sine peak at noon ──────
        solar_capacity = 2500  # MW (representative installed capacity)
        if 6 <= hour <= 18:
            solar_fraction = max(0.0, _math.sin(_math.pi * (hour - 6) / 12))
            cloud_factor = 0.80 + (minute % 20) / 100   # ±20% cloud variation
            solar_output = round(solar_capacity * solar_fraction * cloud_factor)
        else:
            solar_output = 0

        # ── Wind: higher at night, stochastic but deterministic for demo ───
        wind_capacity = 2000
        wind_base = 0.40 if (hour < 6 or hour > 20) else 0.28
        wind_jitter = ((hour * 7 + minute * 3) % 20 - 10) / 100
        wind_output = round(wind_capacity * max(0.10, min(0.85, wind_base + wind_jitter)))

        # ── Hydro: dispatchable, follows demand curve ───────────────────────
        hydro_output = round(2000 * (0.60 if 8 <= hour <= 22 else 0.35))

        # ── Gas peakers: fill the gap to meet demand + 8% spinning reserve ─
        renewables = coal_output + solar_output + wind_output + hydro_output
        target = round(current_demand * 1.08)   # 8% spinning reserve
        gas_output = max(0, min(3500, target - renewables))

        total = coal_output + solar_output + wind_output + hydro_output + gas_output
        headroom = round(total - current_demand)
        reserve_pct = round(headroom / current_demand * 100, 1) if current_demand else 0.0

        alert = (
            "over_generation" if headroom > current_demand * 0.15 else
            "supply_risk"     if headroom < 0 else
            "normal"
        )

        return json.dumps({
            "status": "success",
            "timestamp": now.strftime("%H:%M:%S"),
            "total_generation_mw": total,
            "forecast_demand_mw": current_demand,
            "headroom_mw": headroom,
            "reserve_margin_pct": reserve_pct,
            "grid_alert": alert,
            "generation_mix": {
                "coal_baseload_mw": coal_output,
                "solar_mw":        solar_output,
                "wind_mw":         wind_output,
                "hydro_mw":        hydro_output,
                "gas_peaker_mw":   gas_output
            },
            "note": "Solar uses real physics (sine curve). Demand from real TCN+XGB forecast. Other sources are simulated."
        })
    except Exception as e:
        return json.dumps({"status": "fallback", "total_generation_mw": 15000, "unit": "MW", "error": str(e)})

@mcp.tool()
def get_grid_equipment() -> str:
    """Get all active grid equipment with maintenance status and overdue flags."""
    from datetime import datetime

    today = datetime.now().date()
    equipment = [
        {"id": "GEN-01", "type": "Coal Power Plant",           "capacity_mw": 1200, "maintenance_interval_days": 90,  "last_maintained": "2026-02-01"},
        {"id": "GEN-02", "type": "Solar Farm",                 "capacity_mw": 800,  "maintenance_interval_days": 180, "last_maintained": "2026-04-01"},
        {"id": "GEN-03", "type": "Wind Farm",                  "capacity_mw": 450,  "maintenance_interval_days": 60,  "last_maintained": "2026-03-20"},
        {"id": "TRF-A1", "type": "Main Substation Transformer","capacity_mw": 2000, "maintenance_interval_days": 365, "last_maintained": "2025-12-01"},
        {"id": "BATT-01","type": "Grid Battery Storage",       "capacity_mw": 150,  "maintenance_interval_days": 120, "last_maintained": "2026-01-15"},
    ]
    for eq in equipment:
        from datetime import datetime as dt
        last = dt.strptime(eq["last_maintained"], "%Y-%m-%d").date()
        days_since = (today - last).days
        eq["days_since_last_maintenance"] = days_since
        eq["overdue"] = days_since > eq["maintenance_interval_days"]
        eq["status"] = "needs_maintenance" if eq["overdue"] else "active"
    return json.dumps({"status": "success", "equipment": equipment})

@mcp.tool()
def find_optimal_maintenance_window(equipment_id: str, duration_hours: int = 4) -> str:
    """
    Analyzes the real 24-hour demand forecast to find the safest time window
    to take a specific piece of equipment offline for maintenance.
    Returns the top 3 windows ranked by lowest demand with grid safety checks.
    """
    try:
        from datetime import datetime, timedelta

        EQUIPMENT_REGISTRY = {
            "GEN-01": {"capacity_mw": 1200, "type": "Coal Power Plant"},
            "GEN-02": {"capacity_mw": 800,  "type": "Solar Farm"},
            "GEN-03": {"capacity_mw": 450,  "type": "Wind Farm"},
            "TRF-A1": {"capacity_mw": 2000, "type": "Main Substation Transformer"},
            "BATT-01": {"capacity_mw": 150,  "type": "Grid Battery Storage"},
        }

        if equipment_id not in EQUIPMENT_REGISTRY:
            return json.dumps({"status": "error", "message": f"Unknown equipment ID: {equipment_id}. Call get_grid_equipment first."})

        eq = EQUIPMENT_REGISTRY[equipment_id]
        total_capacity = sum(e["capacity_mw"] for e in EQUIPMENT_REGISTRY.values())
        # Available capacity with this unit offline
        remaining_capacity = total_capacity - eq["capacity_mw"]

        # Use real forecast to evaluate every possible window
        forecast_data = forecast_24h(model="tcn_xgb")
        slots = forecast_data.get("slots", [])

        base_time = datetime.now().replace(minute=0, second=0, microsecond=0)
        windows = []

        for start_idx in range(len(slots) - duration_hours + 1):
            window_slots = slots[start_idx:start_idx + duration_hours]
            peak_demand   = max(s["p50"] for s in window_slots)
            avg_demand    = sum(s["p50"] for s in window_slots) / len(window_slots)
            safety_buffer = remaining_capacity - peak_demand  # positive = safe

            start_dt = base_time + timedelta(hours=start_idx)
            end_dt   = start_dt + timedelta(hours=duration_hours)

            windows.append({
                "start_time":      start_dt.strftime("%Y-%m-%d %H:%M"),
                "end_time":        end_dt.strftime("%Y-%m-%d %H:%M"),
                "avg_demand_mw":   round(avg_demand, 1),
                "peak_demand_mw":  round(peak_demand, 1),
                "safety_buffer_mw": round(safety_buffer, 1),
                "is_safe":         safety_buffer > 200,  # require 200MW headroom minimum
            })

        safe_windows = sorted(
            [w for w in windows if w["is_safe"]],
            key=lambda x: x["avg_demand_mw"]  # lowest demand first = least disruption
        )

        return json.dumps({
            "status": "success",
            "equipment_id":               equipment_id,
            "equipment_type":             eq["type"],
            "capacity_taken_offline_mw":  eq["capacity_mw"],
            "remaining_grid_capacity_mw": remaining_capacity,
            "duration_hours":             duration_hours,
            "recommended_windows":        safe_windows[:3],
            "total_safe_windows_found":   len(safe_windows),
            "note": "Windows ranked by lowest average demand. Use top window's start_time and end_time in schedule_maintenance."
        })

    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})



@mcp.tool()
def propose_grid_action(action_type: str, target_mwh: float, target_hour: str, rationale: str) -> str:
    """
    Propose a grid action (like curtailment or reserve deployment) to the grid officer.
    This does NOT execute the action automatically. It places it in a pending state.
    """
    proposal_id = f"prop_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": action_type,
        "target_mwh": target_mwh,
        "target_hour": target_hour,
        "rationale": rationale,
        "status": "pending_approval"
    }
    
    # Store in JSON database so it crosses process boundaries
    add_proposal(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Proposal successfully submitted to the Grid Officer Dashboard for approval.", 
        "proposal_id": proposal_id
    })

@mcp.tool()
def schedule_maintenance(equipment_id: str, start_time: str, end_time: str, rationale: str = "") -> str:
    """Propose a maintenance schedule for grid equipment during predicted low-demand windows. Always use the window from find_optimal_maintenance_window."""
    proposal_id = f"maint_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": "maintenance",
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "rationale": rationale if rationale else f"Maintenance scheduled for {equipment_id} during a forecast low-demand window ({start_time} – {end_time}) to minimize grid disruption.",
        "status": "pending_approval"
    }
    add_proposal(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Maintenance proposal submitted to dashboard.", 
        "proposal_id": proposal_id
    })

if __name__ == "__main__":
    mcp.run()
