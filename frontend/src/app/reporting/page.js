"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, ComposedChart, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import Card from "@/components/Card";

const API = "http://localhost:8000";

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (v) => v == null ? "" : Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : Number(v).toFixed(1);
const fmtTs = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:00`;
};

function StatusBadge({ status }) {
  const colors = { normal:"#22c55e", warning:"#f59e0b", critical:"#ef4444", stable:"#22c55e", drifting:"#ef4444", unknown:"#6b7280" };
  const labels = { normal:"✅ Normal", warning:"⚠️ Warning", critical:"🔴 Critical", stable:"✅ Stable", drifting:"🔴 Drifting", unknown:"— Unknown" };
  const bg = (colors[status] || "#6b7280") + "1a";
  return (
    <span style={{ background:bg, color:colors[status]||"#6b7280", padding:"4px 12px", borderRadius:"99px", fontSize:"12px", fontWeight:700 }}>
      {labels[status] || status?.toUpperCase()}
    </span>
  );
}

function MetricCard({ label, value, unit, window, status, target }) {
  const ok = status === "stable" || status === "normal";
  return (
    <div style={{ background:"var(--surface)", border:`1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius:"var(--radius)", padding:"24px" }}>
      <p style={{ color:"var(--muted)", fontSize:"12px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>{label}</p>
      <p style={{ fontSize:"36px", fontWeight:800, letterSpacing:"-0.03em", marginBottom:4 }}>
        {value}<span style={{ fontSize:"16px", color:"var(--muted)", fontWeight:500 }}> {unit}</span>
      </p>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:"var(--muted)", fontSize:"12px" }}>{window}</span>
        <StatusBadge status={status} />
      </div>
      {target && <p style={{ color:"var(--muted)", fontSize:"11px", marginTop:8 }}>Target: &lt; {target}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:10, padding:"12px 16px", fontSize:13 }}>
      <p style={{ color:"var(--muted)", marginBottom:6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color:p.color, margin:"2px 0" }}>
          <strong>{p.name}:</strong> {fmt(p.value)} MWh
        </p>
      ))}
    </div>
  );
};

// ── main page ──────────────────────────────────────────────────────────────
export default function ReportingPage() {
  const [liveData,    setLiveData]    = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [perf,        setPerf]        = useState(null);
  const [todaySummary,setTodaySummary]= useState(null);
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [hours,       setHours]       = useState(24);

  const fetchAll = useCallback(async () => {
    try {
      const [liveRes, perfRes, repsRes, sumRes] = await Promise.all([
        fetch(`${API}/api/live-comparison?hours=${hours}`),
        fetch(`${API}/api/model/performance`),
        fetch(`${API}/api/reports`),
        fetch(`${API}/api/reports/today-summary`),
      ]);
      const [live, perf, reps, sum] = await Promise.all([
        liveRes.json(), perfRes.json(), repsRes.json(), sumRes.json(),
      ]);
      setLiveData(live.data || []);
      setLiveSummary(live.summary || {});
      setPerf(perf);
      setReports(reps || []);
      setTodaySummary(sum);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch(`${API}/api/reports/generate`, { method:"POST" });
      await fetchAll();
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column", gap:16 }}>
        <div style={{ width:40, height:40, border:"3px solid var(--primary)", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <p style={{ color:"var(--muted)" }}>Loading Operational Intelligence…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const drift = perf?.drift_status;
  const m7    = perf?.current?.["7d"]  || {};
  const m30   = perf?.current?.["30d"] || {};
  const m90   = perf?.current?.["90d"] || {};

  return (
    <div style={{ padding:"32px", maxWidth:1600, margin:"0 auto" }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:40 }}>
        <div>
          <h1 style={{ fontSize:32, fontWeight:800, letterSpacing:"-0.02em", marginBottom:4 }}>
            Operational Intelligence
          </h1>
          <p style={{ color:"var(--muted)", fontSize:15 }}>
            Real-time model monitoring · Drift detection · Automated PDF reporting
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            background:"var(--primary)", color:"white", padding:"12px 24px",
            borderRadius:8, fontWeight:700, fontSize:14, cursor:"pointer",
            border:"none", opacity:generating?0.6:1, transition:"opacity 0.2s",
          }}
        >
          {generating ? "Generating…" : "⬇ Generate PDF Report"}
        </button>
      </div>

      {/* ── Drift Alert Banner ────────────────────────────────────────── */}
      {drift && drift !== "stable" && (
        <div style={{
          background: drift === "drifting" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${drift === "drifting" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
          borderRadius:10, padding:"16px 24px", marginBottom:32, display:"flex", gap:16, alignItems:"center",
        }}>
          <span style={{ fontSize:24 }}>{drift === "drifting" ? "🔴" : "⚠️"}</span>
          <div>
            <p style={{ fontWeight:700, marginBottom:2 }}>{drift === "drifting" ? "Model Drift Detected" : "Drift Warning"}</p>
            <p style={{ color:"var(--muted)", fontSize:14 }}>{perf?.drift_message}</p>
          </div>
        </div>
      )}

      {/* ── Pillar 3 — Performance Metric Cards ───────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20, marginBottom:40 }}>
        <MetricCard label="MAE" value={m7.mae ?? "–"} unit="MWh" window="7-day avg" status={drift} target="3.0 MWh" />
        <MetricCard label="RMSE" value={m30.rmse ?? "–"} unit="MWh" window="30-day avg" status={drift} target="4.0 MWh" />
        <MetricCard label="MAPE" value={m90.mape ?? "–"} unit="%" window="90-day avg" status={drift} target="5%" />
        <MetricCard label="Drift Status" value={drift?.toUpperCase() ?? "STABLE"} unit="" window={perf?.drift_message?.slice(0,40)+"…"} status={drift} />
      </div>

      {/* ── Two-column: Live Chart + Accuracy Trend ───────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:24, marginBottom:32 }}>

        {/* Pillar 1: Live Actual vs Predicted */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:"var(--radius)", padding:28 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <h2 style={{ fontSize:18, fontWeight:700 }}>Live Actual vs Predicted</h2>
            <div style={{ display:"flex", gap:8 }}>
              {[24, 48, 168].map(h => (
                <button key={h} onClick={() => setHours(h)} style={{
                  padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer",
                  background: hours===h ? "var(--primary)" : "var(--accent)",
                  color: hours===h ? "white" : "var(--muted)",
                  border:"none", transition:"all 0.15s",
                }}>
                  {h === 168 ? "7d" : `${h}h`}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={liveData} margin={{ top:8, right:8, left:-10, bottom:0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradConf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.04}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
              <XAxis dataKey="timestamp" tickFormatter={fmtTs} axisLine={false} tickLine={false} tick={{ fill:"var(--muted)", fontSize:11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill:"var(--muted)", fontSize:11 }} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              {/* P10–P90 confidence band */}
              <Area type="monotone" dataKey="predicted_p90" stroke="none" fill="url(#gradConf)" name="P90" />
              <Area type="monotone" dataKey="predicted_p10" stroke="none" fill="var(--surface)" name="P10" />
              {/* Actual consumption (filled) */}
              <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} fill="url(#gradActual)" name="Actual" dot={false} />
              {/* P50 predicted (dashed) */}
              <Line type="monotone" dataKey="predicted_p50" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="P50 Predicted" />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Stats bar */}
          <div style={{ display:"flex", gap:24, marginTop:20, padding:"14px 20px", background:"var(--accent)", borderRadius:8 }}>
            <div>
              <p style={{ color:"var(--muted)", fontSize:11, marginBottom:2 }}>AVG DEVIATION</p>
              <p style={{ fontSize:20, fontWeight:700 }}>{liveSummary?.avg_deviation_pct ?? "–"}%</p>
            </div>
            <div>
              <p style={{ color:"var(--muted)", fontSize:11, marginBottom:2 }}>MAX ERROR</p>
              <p style={{ fontSize:20, fontWeight:700 }}>{liveSummary?.max_deviation ?? "–"}%</p>
            </div>
            <div>
              <p style={{ color:"var(--muted)", fontSize:11, marginBottom:2 }}>SYSTEM STATUS</p>
              <StatusBadge status={liveSummary?.status || "unknown"} />
            </div>
          </div>
        </div>

        {/* Accuracy Trend */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:"var(--radius)", padding:28, display:"flex", flexDirection:"column", gap:20 }}>
          <h2 style={{ fontSize:18, fontWeight:700 }}>Accuracy Trend (90d)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perf?.trend || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill:"var(--muted)", fontSize:11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill:"var(--muted)", fontSize:11 }} />
              <Tooltip contentStyle={{ background:"var(--surface)", borderRadius:8, border:"1px solid var(--surface-border)", fontSize:13 }} />
              <Legend verticalAlign="top" height={32} />
              <Line type="monotone" dataKey="mae"  stroke="#6366f1" strokeWidth={2} dot={{ r:3 }} name="MAE" />
              <Line type="monotone" dataKey="mape" stroke="#f59e0b" strokeWidth={2} dot={{ r:3 }} name="MAPE %" />
            </LineChart>
          </ResponsiveContainer>

          {/* Today Quick Summary */}
          {todaySummary && (
            <div style={{ background:"var(--accent)", borderRadius:10, padding:20 }}>
              <p style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📋 Today's Summary — {todaySummary.date}</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
                <div style={{ textAlign:"center" }}>
                  <p style={{ fontSize:22, fontWeight:800, color:"#22c55e" }}>{todaySummary.accuracy}%</p>
                  <p style={{ color:"var(--muted)", fontSize:11 }}>Accuracy</p>
                </div>
                <div style={{ textAlign:"center" }}>
                  <p style={{ fontSize:22, fontWeight:800, color: todaySummary.anomalies > 0 ? "#f59e0b" : "var(--foreground)" }}>{todaySummary.anomalies}</p>
                  <p style={{ color:"var(--muted)", fontSize:11 }}>Anomalies</p>
                </div>
                <div style={{ textAlign:"center" }}>
                  <p style={{ fontSize:22, fontWeight:800, color:"#6366f1" }}>{todaySummary.savings}</p>
                  <p style={{ color:"var(--muted)", fontSize:11 }}>Est. Savings</p>
                </div>
              </div>
              {/* Progress bar */}
              <p style={{ color:"var(--muted)", fontSize:11, marginBottom:6 }}>{todaySummary.hours_done}/{todaySummary.hours_total} hours logged</p>
              <div style={{ background:"var(--surface-border)", borderRadius:99, height:6 }}>
                <div style={{
                  background:"var(--primary)", borderRadius:99, height:6,
                  width: `${Math.round((todaySummary.hours_done / todaySummary.hours_total) * 100)}%`,
                  transition:"width 0.4s",
                }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pillar 2 — Reports Archive ───────────────────────────────── */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:"var(--radius)", padding:32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ fontSize:20, fontWeight:700 }}>Automated Reports Archive</h2>
          <span style={{ color:"var(--muted)", fontSize:13 }}>{reports.length} report{reports.length !== 1 ? "s" : ""} generated</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
          <thead>
            <tr style={{ background:"var(--accent)" }}>
              {["Report Name", "Date Generated", "Format", "Action"].map(h => (
                <th key={h} style={{ padding:"14px 20px", textAlign:"left", fontWeight:600, color:"var(--muted)", fontSize:12, textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => (
              <tr key={i} style={{ borderTop:"1px solid var(--surface-border)", transition:"background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background="var(--accent)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
              >
                <td style={{ padding:"16px 20px", fontWeight:600 }}>{r.name}</td>
                <td style={{ padding:"16px 20px", color:"var(--muted)" }}>{r.date}</td>
                <td style={{ padding:"16px 20px" }}>
                  <span style={{ background:"rgba(99,102,241,0.1)", color:"#6366f1", padding:"4px 10px", borderRadius:6, fontWeight:700, fontSize:12 }}>
                    {r.format}
                  </span>
                </td>
                <td style={{ padding:"16px 20px" }}>
                  <button
                    onClick={() => window.open(`${API}/api/reports/${r.id}/download`, "_blank")}
                    style={{ color:"var(--primary)", fontWeight:700, background:"none", border:"none", cursor:"pointer", fontSize:14 }}
                  >
                    📥 Download
                  </button>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding:"48px", textAlign:"center", color:"var(--muted)" }}>
                  No reports yet. Click <strong>"Generate PDF Report"</strong> above to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
