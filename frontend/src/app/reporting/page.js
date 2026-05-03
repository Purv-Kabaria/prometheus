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
    <div style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", fontSize:13, color: "#fff" }}>
      <p style={{ color:"#94a3b8", marginBottom:6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color:p.color, margin:"2px 0" }}>
          <strong>{p.name}:</strong> {fmt(p.value)} MWh
        </p>
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
        // Fetch 2000 points of history for the chosen frequency
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
      alert("Failed to generate report. Check backend logs.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading && !historyData.length && !liveData.length) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column", gap:16 }}>
        <div style={{ width:40, height:40, border:"3px solid var(--primary)", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <p style={{ color:"var(--muted)" }}>Analyzing Grid Intelligence…</p>
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

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:40 }}>
        <div>
          <h1 style={{ fontSize:32, fontWeight:800, letterSpacing:"-0.02em", marginBottom:4 }}>
            Operational Intelligence
          </h1>
          <p style={{ color:"var(--muted)", fontSize:15 }}>
            Real-time grid monitoring & 2016-2021 historical dataset explorer.
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

      {/* Mode Switcher */}
      <div style={{ display:"flex", gap:4, background:"var(--accent)", padding:4, borderRadius:12, marginBottom:32, width:"fit-content" }}>
        <button 
          onClick={() => setViewMode("live")}
          style={{
            padding:"10px 24px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
            background: viewMode === "live" ? "var(--surface)" : "transparent",
            color: viewMode === "live" ? "var(--primary)" : "var(--muted)",
            transition: "all 0.2s"
          }}
        >
          ⚡ Live Operations
        </button>
        <button 
          onClick={() => setViewMode("explorer")}
          style={{
            padding:"10px 24px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
            background: viewMode === "explorer" ? "var(--surface)" : "transparent",
            color: viewMode === "explorer" ? "var(--primary)" : "var(--muted)",
            transition: "all 0.2s"
          }}
        >
          📊 Dataset Explorer (2016-2021)
        </button>
      </div>

      {/* Metrics Row (Only in Live Mode) */}
      {viewMode === "live" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20, marginBottom:40 }}>
          <MetricCard label="MAE" value={m7.mae ?? "–"} unit="MWh" window="7-day avg" status={drift} target="3.0 MWh" />
          <MetricCard label="RMSE" value={m30.rmse ?? "–"} unit="MWh" window="30-day avg" status={drift} target="4.0 MWh" />
          <MetricCard label="MAPE" value={m90.mape ?? "–"} unit="%" window="90-day avg" status={drift} target="5%" />
          <MetricCard label="Drift Status" value={drift?.toUpperCase() ?? "STABLE"} unit="" window={perf?.drift_message?.slice(0,30)} status={drift} />
        </div>
      )}

      {/* Main Intelligence Chart */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:"var(--radius)", padding:28, marginBottom:32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ fontSize:18, fontWeight:700 }}>
            {viewMode === "live" ? "Operational Timeline" : "Historical Intelligence Matrix"}
          </h2>
          <div style={{ display:"flex", gap:8 }}>
            {viewMode === "live" ? (
              [24, 72, 168].map(h => (
                <button key={h} onClick={() => setHours(h)} style={{
                  padding:"6px 14px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:"none",
                  background: hours===h ? "var(--primary)" : "var(--accent)", color: hours===h ? "white" : "var(--muted)"
                }}>
                  {h === 168 ? "7 Days" : `${h}h`}
                </button>
              ))
            ) : (
              ["H", "D", "W", "M"].map(f => (
                <button key={f} onClick={() => setFreq(f)} style={{
                  padding:"6px 14px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:"none",
                  background: freq===f ? "var(--primary)" : "var(--accent)", color: freq===f ? "white" : "var(--muted)"
                }}>
                  {f === "H" ? "Hourly" : f === "D" ? "Daily" : f === "W" ? "Weekly" : "Monthly"}
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ height: 480, width: "100%", background: "#0f172a", borderRadius: 12, border: "1px solid var(--surface-border)", padding: "20px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={viewMode === "live" ? liveData : historyData} margin={{ top:5, right:10, left:-15, bottom:0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradConf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.04}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(ts) => {
                  const d = new Date(ts);
                  if (viewMode === "explorer" && freq !== "H") return `${d.getFullYear()}-${d.getMonth()+1}`;
                  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`;
                }} 
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false} tick={{ fill:"#94a3b8", fontSize:10 }} 
                interval="preserveStartEnd" minTickGap={40}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill:"#94a3b8", fontSize:11 }} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={40} align="right" />
              
              <Area type="monotone" dataKey="predicted_p90" stroke="none" fill="url(#gradConf)" name="P90 Range" />
              <Area type="monotone" dataKey="predicted_p10" stroke="none" fill="#0f172a" name="P10 Range" />
              
              <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} fill="url(#gradActual)" name="Actual Consumption" dot={false} />
              <Line type="monotone" dataKey="predicted_p50" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Model Prediction" />

            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reports Archive */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--surface-border)", borderRadius:"var(--radius)", padding:32 }}>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:24 }}>Automated Reports Archive</h2>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
          <thead>
            <tr style={{ background:"var(--accent)" }}>
              {["Report Name", "Date", "Time", "Format", "Action"].map(h => (
                <th key={h} style={{ padding:"14px 20px", textAlign:"left", fontWeight:600, color:"var(--muted)", fontSize:12, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => (
              <tr key={i} style={{ borderTop:"1px solid var(--surface-border)" }}>
                <td style={{ padding:"16px 20px", fontWeight:600 }}>{r.name}</td>
                <td style={{ padding:"16px 20px", color:"var(--muted)" }}>{r.date}</td>
                <td style={{ padding:"16px 20px", color:"var(--muted)", fontFamily:"monospace" }}>{r.time || "00:00:00"}</td>
                <td style={{ padding:"16px 20px" }}>
                  <span style={{ background:"rgba(99,102,241,0.1)", color:"#6366f1", padding:"4px 10px", borderRadius:6, fontWeight:700, fontSize:12 }}>{r.format}</span>
                </td>
                <td style={{ padding:"16px 20px" }}>
                  <button onClick={() => window.open(`${API}/api/reports/${r.id}/download`, "_blank")} style={{ color:"var(--primary)", fontWeight:700, background:"none", border:"none", cursor:"pointer" }}>📥 Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
