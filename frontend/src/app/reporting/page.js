"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, ComposedChart, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
  Brush,
} from "recharts";
import Card from "@/components/Card";
import { useIsClient } from "@/hooks/useIsClient";

const API = "http://localhost:8000";
const REALIZED_TARIFF_DEFAULT = 3.09; // INR per kWh
const OPEX_PER_UNIT = 0.45; // INR per kWh
const CARBON_CREDIT_RATE = 0.20; // INR per kWh
const DISTRIBUTION_LOSS_FACTOR = 0.0529; // 5.29%
const AVAILABILITY_TARGET = 99.6;
const NOTIONAL_REVENUE_COLOR = "#0ea5e9";

// ─── Model Selector Component ───────────────────────────────────────────────────
function ModelSelector({ models, activeModel, onChange, loading }) {
  if (!models || models.length === 0) return null;
  const options = [{ key: "default", name: "System Default (Ensemble)" }, ...models];
  
  return (
    <div style={{ marginBottom: "32px", maxWidth: "480px" }}>
      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
        Forecast Model Evaluation
      </div>
      <div style={{ position: "relative" }}>
        <select
          value={activeModel}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: "10px",
            background: "var(--surface)", border: "1px solid var(--surface-border)",
            color: "var(--foreground)", fontSize: "14px", fontWeight: "600",
            outline: "none", cursor: loading ? "not-allowed" : "pointer",
            appearance: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
          }}
        >
          {options.map(m => (
            <option key={m.key} value={m.key} disabled={m.key !== "default" && !m.loaded}>
              {m.name} {!m.loaded && m.key !== "default" ? "(Syncing...)" : ""}
            </option>
          ))}
        </select>
        <div style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted)", fontSize: "10px" }}>▼</div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => v == null ? "" : Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : Number(v).toFixed(1);

function StatusBadge({ status }) {
  const colors = { 
    normal: "var(--success)", 
    warning: "var(--warning)", 
    critical: "var(--danger)", 
    stable: "var(--success)", 
    incentive: "var(--success)",
    at_risk: "var(--danger)",
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
          <span style={{ fontWeight: "600", color: "var(--foreground)" }}>
            {p.dataKey === "notional_revenue_cr" ? (
              <span style={{ color: NOTIONAL_REVENUE_COLOR }}>₹{Number(p.value).toFixed(2)} Cr</span>
            ) : (
              `${fmt(p.value)} MWh`
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ReportingPage() {
  const [loading, setLoading] = useState(true);
  const isClient = useIsClient();

  // State
  const [freq, setFreq] = useState("W"); // H, D, W, M
  const [historyData, setHistoryData] = useState([]);
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);

  // Model State
  const [activeModel, setActiveModel] = useState("default");
  const [models, setModels] = useState([]);

  const totalMWh = historyData.reduce((sum, row) => sum + (Number(row.actual) || 0), 0);
  const billedMWh = totalMWh * (1 - DISTRIBUTION_LOSS_FACTOR);
  const grossRevenueINR = totalMWh * 1000 * REALIZED_TARIFF_DEFAULT;
  const opexINR = totalMWh * 1000 * OPEX_PER_UNIT;
  const ebitdaINR = grossRevenueINR - opexINR;
  const carbonCreditINR = billedMWh * 1000 * CARBON_CREDIT_RATE;
  const realizedRevenueCr = grossRevenueINR / 1e7;
  const ebitdaMarginPct = grossRevenueINR > 0 ? (ebitdaINR / grossRevenueINR) * 100 : 0;
  const transmissionAvailability = 99.6;
  const realizedTariffObserved = billedMWh > 0 ? grossRevenueINR / (billedMWh * 1000) : REALIZED_TARIFF_DEFAULT;
  const tariffDriftPct = ((realizedTariffObserved - REALIZED_TARIFF_DEFAULT) / REALIZED_TARIFF_DEFAULT) * 100;
  const tariffStatus = Math.abs(tariffDriftPct) > 5 ? "drifting" : "stable";

  const chartData = historyData.map((row) => {
    const actual = Number(row.actual) || 0;
    return {
      ...row,
      notional_revenue_cr: (actual * 1000 * REALIZED_TARIFF_DEFAULT) / 1e7,
    };
  });

  useEffect(() => {
    fetch(`${API}/api/forecast/models`)
      .then(r => r.json())
      .then(d => setModels(d.models || []))
      .catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, repsRes] = await Promise.all([
        fetch(`${API}/api/grid-history?freq=${freq}&limit=2000&model=${activeModel}`),
        fetch(`${API}/api/reports`),
      ]);

      const [hist, reps] = await Promise.all([histRes.json(), repsRes.json()]);
      setHistoryData(hist.data || []);
      setReports(reps || []);
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, [freq, activeModel]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let url = `${API}/api/reports/generate`;
      if (historyData.length > 0) {
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


  return (
    <div style={{ paddingBottom: "80px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "48px" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Operational intelligence</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Historical dataset exploration and institutional report generation</p>
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
      {/* Mode Indicator (Explorer only) */}
      <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid var(--surface-border)", marginBottom: "32px" }}>
        <div 
          style={{
            padding: "12px 4px", fontSize: "14px", fontWeight: "600", 
            color: "var(--foreground)",
            borderBottom: "2px solid var(--primary)",
          }}
        >
          Historical Intelligence Explorer
        </div>
      </div>

      {/* Model Selection */}
      <ModelSelector 
        models={models} 
        activeModel={activeModel} 
        onChange={setActiveModel} 
        loading={loading} 
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "36px" }}>
        <MetricCard
          label="Realized Revenue"
          value={realizedRevenueCr.toFixed(2)}
          unit="₹ Cr"
          window="Selected history window"
          status={tariffStatus}
          target={`₹${REALIZED_TARIFF_DEFAULT.toFixed(2)}/kWh`}
        />
        <MetricCard
          label="Unit EBITDA Margin"
          value={ebitdaMarginPct.toFixed(1)}
          unit="%"
          window="Gross Revenue - OpEx"
          status={ebitdaMarginPct >= 91 ? "incentive" : "warning"}
          target="91%"
        />
        <MetricCard
          label="Transmission Availability"
          value={transmissionAvailability.toFixed(1)}
          unit="%"
          window="Institutional benchmark"
          status={transmissionAvailability >= AVAILABILITY_TARGET ? "incentive" : "warning"}
          target="99.6%"
        />
      </div>


      {/* Main Intelligence Chart */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px", marginBottom: "48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Trend Visualization Matrix
          </h3>
          <div style={{ display: "flex", gap: "12px" }}>
            {["H", "D", "W", "M"].map(f => (
              <button key={f} onClick={() => setFreq(f)} style={{
                padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer", 
                border: "1px solid var(--surface-border)",
                background: freq === f ? "var(--accent)" : "var(--surface)", 
                color: freq === f ? "var(--primary)" : "var(--muted)"
              }}>
                {f === "H" ? "Hourly" : f === "D" ? "Daily" : f === "W" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 420 }}>
          {isClient ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 24, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--success)" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(ts) => {
                  const d = new Date(ts);
                  if (freq !== "H") return `${d.getFullYear()}/${d.getMonth()+1}`;
                  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`;
                }} 
                axisLine={false}
                tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} 
                interval="preserveStartEnd" minTickGap={40}
              />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: NOTIONAL_REVENUE_COLOR, fontSize: 10 }}
                tickFormatter={(v) => `${Number(v).toFixed(2)}Cr`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={40}
                align="right"
                iconType="circle"
                formatter={(value, entry) => (
                  <span style={{ color: entry?.dataKey === "notional_revenue_cr" ? NOTIONAL_REVENUE_COLOR : "var(--foreground)" }}>
                    {value}
                  </span>
                )}
              />
              
              <Area yAxisId="left" type="monotone" dataKey="actual" stroke="var(--success)" strokeWidth={2} fill="url(#gradActual)" name="Actual demand" dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="predicted_p50" stroke="var(--warning)" strokeWidth={2} strokeDasharray="4 4" dot={false} name={`${activeModel === "default" ? "System" : activeModel} prediction`} />
              <Line yAxisId="right" type="monotone" dataKey="notional_revenue_cr" stroke={NOTIONAL_REVENUE_COLOR} strokeWidth={2} dot={false} name="Notional Revenue (₹ Cr)" />

            </ComposedChart>
          </ResponsiveContainer>
          ) : <div style={{ width: "100%", height: "100%", minHeight: 420 }} />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "40px" }}>
        <Card title="Net Energy Billed" value={`${billedMWh.toFixed(1)} MWh`} subtext={`Loss-adjusted using ${(DISTRIBUTION_LOSS_FACTOR * 100).toFixed(2)}% factor`} accentColor="var(--primary)" />
        <Card title="Operational Profit (EBITDA)" value={`₹${(ebitdaINR / 1e7).toFixed(2)} Cr`} subtext={`Opex baseline ₹${OPEX_PER_UNIT.toFixed(2)}/kWh`} accentColor="var(--success)" />
        <Card title="Carbon Credit Potential" value={`₹${(carbonCreditINR / 1e7).toFixed(2)} Cr`} subtext={`Rate ₹${CARBON_CREDIT_RATE.toFixed(2)}/kWh renewable mix`} accentColor="var(--warning)" />
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
