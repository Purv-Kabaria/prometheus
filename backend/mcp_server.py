from mcp.server.fastmcp import FastMCP
import json
import random
import sys
import os
from datetime import datetime

# Ensure we can import from local directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import add_proposal

# Initialize the FastMCP server for the Grid Agent
mcp = FastMCP("PrometheusGridAgent")

# ── Equipment registry ────────────────────────────────────────────────────────
_EQUIPMENT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "equipment.json")

def _load_equipment() -> list:
    """Load the configurable equipment list from data/equipment.json."""
    try:
        with open(_EQUIPMENT_JSON, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"[MCP] Could not load equipment.json: {e}. Using minimal fallback.")
        return [
            {"id": "GEN-01", "type": "Coal Power Plant", "capacity_mw": 1200,
             "maintenance_interval_days": 90, "last_maintained": "2026-02-01"},
        ]

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
    Generation capacity dynamically reflects live equipment health from get_grid_equipment().
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

        # ── Dynamically aggregate capacity from live equipment health ────────
        equipment = json.loads(get_grid_equipment())["equipment"]
        base_cap = {"Coal Baseload": 0, "Solar Farm": 0, "Wind Farm": 0, "Hydro Plant": 0, "Gas Peaker Plant": 0}
        derated_units = []
        for eq in equipment:
            typ = eq.get("type", "")
            if typ in base_cap:
                health = eq.get("health_pct", 100)
                eff = 0.85 + (0.15 * (health / 100.0))
                if eq.get("overdue"):
                    eff = 0.40
                    derated_units.append(f"{eq['id']} (health {health}%, overdue — derated to 40%)")
                base_cap[typ] += int(eq.get("capacity_mw", 0) * eff)

        coal_capacity  = base_cap["Coal Baseload"] or 6000
        solar_capacity = base_cap["Solar Farm"] or 2500
        wind_capacity  = base_cap["Wind Farm"] or 2000
        hydro_capacity = base_cap["Hydro Plant"] or 2000
        gas_capacity   = base_cap["Gas Peaker Plant"] or 3500

        # ── Coal baseload: stable, slightly fluctuates with minute ─────────
        coal_output = round(coal_capacity * 0.85 + (minute % 15) * 2)

        # ── Solar: physically real — zero at night, sine peak at noon ──────
        if 6 <= hour <= 18:
            solar_fraction = max(0.0, _math.sin(_math.pi * (hour - 6) / 12))
            cloud_factor = 0.80 + (minute % 20) / 100
            solar_output = round(solar_capacity * solar_fraction * cloud_factor)
        else:
            solar_output = 0

        # ── Wind: higher at night, stochastic but deterministic for demo ───
        wind_base = 0.40 if (hour < 6 or hour > 20) else 0.28
        wind_jitter = ((hour * 7 + minute * 3) % 20 - 10) / 100
        wind_output = round(wind_capacity * max(0.10, min(0.85, wind_base + wind_jitter)))

        # ── Hydro: dispatchable, follows demand curve ───────────────────────
        hydro_output = round(hydro_capacity * (0.60 if 8 <= hour <= 22 else 0.35))

        # ── Gas peakers: fill the gap to meet demand + 8% spinning reserve ─
        renewables = coal_output + solar_output + wind_output + hydro_output
        target = round(current_demand * 1.08)
        gas_output = max(0, min(gas_capacity, target - renewables))

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
            "derated_units": derated_units,
            "note": "Capacity dynamically derived from live equipment health. Derated units are severely throttled."
        })
    except Exception as e:
        return json.dumps({"status": "fallback", "total_generation_mw": 15000, "unit": "MW", "error": str(e)})

@mcp.tool()
def get_grid_equipment() -> str:
    """Get all active grid equipment with maintenance status and overdue flags. Loads from data/equipment.json."""
    today = datetime.now().date()
    equipment = _load_equipment()
    for eq in equipment:
        last = datetime.strptime(eq["last_maintained"], "%Y-%m-%d").date()
        days_since = (today - last).days
        eq["days_since_last_maintenance"] = days_since
        eq["overdue"] = days_since > eq["maintenance_interval_days"]
        eq["status"] = "needs_maintenance" if eq["overdue"] else "active"
    return json.dumps({"status": "success", "equipment": equipment, "source": "data/equipment.json"})

@mcp.tool()
def find_optimal_maintenance_window(equipment_id: str, duration_hours: int = 4) -> str:
    """
    Analyzes the real 24-hour demand forecast to find the safest time window
    to take a specific piece of equipment offline for maintenance.
    Returns the top 3 windows ranked by lowest demand with grid safety checks.
    """
    try:
        from datetime import datetime, timedelta

        # Build registry dynamically from the same JSON source
        EQUIPMENT_REGISTRY = {
            eq["id"]: {"capacity_mw": eq["capacity_mw"], "type": eq["type"]}
            for eq in _load_equipment()
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
    # ── Server-side ID validation — prevents LLM hallucinations ──────────────
    equipment = _load_equipment()
    valid_ids = [eq["id"] for eq in equipment]
    if equipment_id not in valid_ids:
        return json.dumps({
            "status": "error",
            "message": f"Invalid equipment_id '{equipment_id}'. You MUST use one of the real IDs returned by get_grid_equipment(). Valid IDs are: {valid_ids}. Call get_grid_equipment() first to get the correct IDs.",
        })
    # ─────────────────────────────────────────────────────────────────────────

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

@mcp.tool()
def analyze_market_finance(entity_code: str = "IND") -> str:
    """Get the current carbon compliance liability of the grid using Ember API live data."""
    try:
        import asyncio
        from services.ember_client import ember_client
        
        # In a threadpool where no event loop is running, asyncio.run works.
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = None
            
        if loop and loop.is_running():
            import nest_asyncio
            nest_asyncio.apply()
            data = loop.run_until_complete(ember_client.calculate_carbon_liability(entity_code))
        else:
            data = asyncio.run(ember_client.calculate_carbon_liability(entity_code))
            
        return json.dumps(data)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@mcp.tool()
def propose_emissions_trade(entity_code: str, action: str, tonnes_co2: float, price_usd: float, rationale: str) -> str:
    """Propose a carbon emission credit trade ('buy' or 'sell') to the grid officer based on compliance liability."""
    proposal_id = f"trade_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": "carbon_trade",
        "trade_action": action,
        "entity_code": entity_code,
        "tonnes_co2": tonnes_co2,
        "price_usd": price_usd,
        "rationale": rationale,
        "status": "pending_approval"
    }
    add_proposal(proposal)
    return json.dumps({
        "status": "success", 
        "message": f"Carbon trade proposal ({action} {tonnes_co2} tonnes) submitted for approval.", 
        "proposal_id": proposal_id
    })

if __name__ == "__main__":
    mcp.run()
