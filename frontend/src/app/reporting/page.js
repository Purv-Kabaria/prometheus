"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, ComposedChart, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
  Brush,
} from "recharts";
import Card from "@/components/Card";

const API = "http://localhost:8000";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => v == null ? "" : Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : Number(v).toFixed(1);

function StatusBadge({ status }) {
  const colors = { 
    normal: "var(--success)", 
    warning: "var(--warning)", 
    critical: "var(--danger)", 
    stable: "var(--success)", 
    drifting: "var(--danger)", 
    unknown: "var(--muted)" 
  };
  return (
    <span style={{ 
      background: "var(--accent)", 
      color: colors[status] || "var(--muted)", 
      padding: "2px 10px", 
      borderRadius: "4px", 
      fontSize: "10px", 
      fontWeight: "700",
      textTransform: "uppercase"
    }}>
      {status || "UNKNOWN"}
    </span>
  );
}

function MetricCard({ label, value, unit, window, status, target }) {
  return (
    <div style={{ 
      background: "var(--surface)", 
      border: "1px solid var(--surface-border)", 
      borderRadius: "var(--radius)", 
      padding: "24px" 
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <p style={{ color: "var(--muted)", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>
        <StatusBadge status={status} />
      </div>
      <p style={{ fontSize: "32px", fontWeight: "400", letterSpacing: "-0.02em", marginBottom: "4px" }} className="serif">
        {value}<span style={{ fontSize: "14px", color: "var(--muted)", fontWeight: "500", marginLeft: "4px" }}>{unit}</span>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", borderTop: "1px solid var(--accent)", paddingTop: "12px" }}>
        <span style={{ color: "var(--muted)", fontSize: "12px" }}>{window}</span>
        {target && <span style={{ color: "var(--muted)", fontSize: "11px" }}>Target: {target}</span>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ 
      background: "var(--surface)", 
      border: "1px solid var(--surface-border)", 
      borderRadius: "8px", 
      padding: "12px 16px", 
      fontSize: "12px", 
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)" 
    }}>
      <p style={{ color: "var(--muted)", marginBottom: "8px", fontWeight: "600" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "4px" }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: "600", color: "var(--foreground)" }}>{fmt(p.value)} MWh</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ReportingPage() {
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("live"); // "live" | "explorer"
  
  // Live State
  const [hours, setHours] = useState(24);
  const [liveData, setLiveData] = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [perf, setPerf] = useState(null);
  const [todaySummary, setTodaySummary] = useState(null);
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);

  // Explorer State (2016-2021)
  const [freq, setFreq] = useState("W"); // H, D, W
  const [historyData, setHistoryData] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === "live") {
        const [liveRes, perfRes, repsRes, sumRes] = await Promise.all([
          fetch(`${API}/api/live-comparison?hours=${hours}`),
          fetch(`${API}/api/model/performance`),
          fetch(`${API}/api/reports`),
          fetch(`${API}/api/reports/today-summary`),
        ]);
        const [live, perfData, reps, sum] = await Promise.all([
          liveRes.json(), perfRes.json(), repsRes.json(), sumRes.json(),
        ]);
        setLiveData(live.data || []);
        setLiveSummary(live.summary || {});
        setPerf(perfData);
        setReports(reps || []);
        setTodaySummary(sum);
      } else {
        const res = await fetch(`${API}/api/grid-history?freq=${freq}&limit=2000`);
        const data = await res.json();
        setHistoryData(data.data || []);
      }
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, [hours, viewMode, freq]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let url = `${API}/api/reports/generate`;
      if (viewMode === "explorer" && historyData.length > 0) {
        const start = historyData[0].timestamp;
        const end   = historyData[historyData.length - 1].timestamp;
        url += `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      }
      const res = await fetch(url, { method:"POST" });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await fetchAll();
    } catch (err) {
      console.error("Report generation failed", err);
    } finally {
      setGenerating(false);
    }
  };

  const drift = perf?.drift_status;
  const m7    = perf?.current?.["7d"]  || {};
  const m30   = perf?.current?.["30d"] || {};
  const m90   = perf?.current?.["90d"] || {};

  return (
    <div style={{ paddingBottom: "80px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "48px" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Operational intelligence</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Comprehensive grid performance monitoring and historical dataset exploration</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            background: "var(--primary)", color: "white", padding: "10px 24px",
            borderRadius: 8, fontWeight: "600", fontSize: "14px", cursor: "pointer",
            border: "none", opacity: generating ? 0.7 : 1, transition: "opacity 0.2s",
          }}
        >
          {generating ? "Generating..." : "Generate PDF report"}
        </button>
      </div>

      {/* Mode Switcher */}
      <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid var(--surface-border)", marginBottom: "32px" }}>
        <button 
          onClick={() => setViewMode("live")}
          style={{
            padding: "12px 4px", fontSize: "14px", fontWeight: viewMode === "live" ? "600" : "400", 
            cursor: "pointer", border: "none", background: "transparent",
            color: viewMode === "live" ? "var(--foreground)" : "var(--muted)",
            borderBottom: viewMode === "live" ? "2px solid var(--primary)" : "2px solid transparent",
            transition: "all 0.2s"
          }}
        >
          Live operations
        </button>
        <button 
          onClick={() => setViewMode("explorer")}
          style={{
            padding: "12px 4px", fontSize: "14px", fontWeight: viewMode === "explorer" ? "600" : "400", 
            cursor: "pointer", border: "none", background: "transparent",
            color: viewMode === "explorer" ? "var(--foreground)" : "var(--muted)",
            borderBottom: viewMode === "explorer" ? "2px solid var(--primary)" : "2px solid transparent",
            transition: "all 0.2s"
          }}
        >
          Dataset explorer (2016-2021)
        </button>
      </div>

      {/* Metrics Row (Only in Live Mode) */}
      {viewMode === "live" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px", marginBottom: "48px" }}>
          <MetricCard label="MAE" value={m7.mae ?? "–"} unit="MWh" window="7-day avg" status={drift} target="3.0" />
          <MetricCard label="RMSE" value={m30.rmse ?? "–"} unit="MWh" window="30-day avg" status={drift} target="4.0" />
          <MetricCard label="MAPE" value={m90.mape ?? "–"} unit="%" window="90-day avg" status={drift} target="5%" />
          <MetricCard label="Drift status" value={drift?.toUpperCase() ?? "STABLE"} unit="" window="System health" status={drift} />
        </div>
      )}

      {/* Main Intelligence Chart */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px", marginBottom: "48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {viewMode === "live" ? "Operational Timeline" : "Historical Intelligence Matrix"}
          </h3>
          <div style={{ display: "flex", gap: "12px" }}>
            {viewMode === "live" ? (
              [24, 72, 168].map(h => (
                <button key={h} onClick={() => setHours(h)} style={{
                  padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer", 
                  border: "1px solid var(--surface-border)",
                  background: hours === h ? "var(--accent)" : "var(--surface)", 
                  color: hours === h ? "var(--primary)" : "var(--muted)"
                }}>
                  {h === 168 ? "7D" : `${h}H`}
                </button>
              ))
            ) : (
              ["H", "D", "W", "M"].map(f => (
                <button key={f} onClick={() => setFreq(f)} style={{
                  padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer", 
                  border: "1px solid var(--surface-border)",
                  background: freq === f ? "var(--accent)" : "var(--surface)", 
                  color: freq === f ? "var(--primary)" : "var(--muted)"
                }}>
                  {f === "H" ? "Hourly" : f === "D" ? "Daily" : f === "W" ? "Weekly" : "Monthly"}
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={viewMode === "live" ? liveData : historyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(ts) => {
                  const d = new Date(ts);
                  if (viewMode === "explorer" && freq !== "H") return `${d.getFullYear()}/${d.getMonth()+1}`;
                  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`;
                }} 
                axisLine={false}
                tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} 
                interval="preserveStartEnd" minTickGap={40}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={40} align="right" iconType="circle" />
              
              <Area type="monotone" dataKey="actual" stroke="var(--primary)" strokeWidth={2} fill="url(#gradActual)" name="Actual demand" dot={false} />
              <Line type="monotone" dataKey="predicted_p50" stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Model prediction" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reports Archive */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <h2 className="serif" style={{ fontSize: "24px", fontWeight: "400" }}>Report archive</h2>
        <span style={{ background: "var(--accent)", color: "var(--primary)", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px" }}>
          AUTOMATED LOG
        </span>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--surface-border)" }}>
              {["Report name", "Date", "Format", "Actions"].map(h => (
                <th key={h} style={{ padding: "16px 24px", textAlign: "left", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "48px", textAlign: "center", color: "var(--muted)" }}>
                  No reports generated yet.
                </td>
              </tr>
            ) : (
              reports.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--surface-border)" }}>
                  <td style={{ padding: "16px 24px", fontWeight: "600" }}>{r.name}</td>
                  <td style={{ padding: "16px 24px", color: "var(--muted)" }}>{r.date} · {r.time || "00:00"}</td>
                  <td style={{ padding: "16px 24px" }}>
                    <span style={{ background: "var(--accent)", color: "var(--primary)", padding: "2px 8px", borderRadius: "4px", fontWeight: "700", fontSize: "10px" }}>{r.format}</span>
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <button 
                      onClick={() => window.open(`${API}/api/reports/${r.id}/download`, "_blank")} 
                      style={{ color: "var(--primary)", fontWeight: "700", background: "none", border: "none", cursor: "pointer", fontSize: "11px", textTransform: "uppercase" }}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

