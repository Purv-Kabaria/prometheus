"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Cell, Legend
} from "recharts";

const API = "http://localhost:8000/api/forecast";

// ─── Model type colors ────────────────────────────────────────────────────────
const MODEL_COLORS = {
  synthetic:      { accent: "#8b5cf6", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.25)" },
  lgbm:           { accent: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)" },
  tcn_xgb:        { accent: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  adani_catboost: { accent: "#ec4899", bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.25)" }, // pink
  adani_lightgbm: { accent: "#06b6d4", bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.25)" }, // cyan
  adani_prophet:  { accent: "#f43f5e", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.25)" }, // rose
  adani_stacking: { accent: "#84cc16", bg: "rgba(132,204,22,0.08)", border: "rgba(132,204,22,0.25)" }, // lime
  adani_ultimate: { accent: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)" }, // indigo
  adani_voting:   { accent: "#14b8a6", bg: "rgba(20,184,166,0.08)", border: "rgba(20,184,166,0.25)" }, // teal
  adani_xgboost:  { accent: "#d946ef", bg: "rgba(217,70,239,0.08)", border: "rgba(217,70,239,0.25)" }, // fuchsia
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const fmtMW = (n) => `${fmt(n)} MW`;

function Badge({ label, color }) {
  const colors = {
    critical: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
    high:     { bg: "#fff7ed", text: "#ea580c", border: "#fed7aa" },
    elevated: { bg: "#fefce8", text: "#ca8a04", border: "#fef08a" },
    success:  { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
    info:     { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  };
  const c = colors[color] || colors.info;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: "600"
    }}>{label}</span>
  );
}

function KpiCard({ title, value, sub, icon, accent = "#3b82f6" }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--surface-border)",
      borderRadius: "14px", padding: "20px 24px",
      borderTop: `3px solid ${accent}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
        <span style={{ fontSize: "20px" }}>{icon}</span>
      </div>
      <div style={{ fontSize: "26px", fontWeight: "800", color: "var(--foreground)", marginTop: "8px", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--surface-border)",
      borderRadius: "10px", padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
    }}>
      <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "8px", fontWeight: "600" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "4px" }}>
          <span style={{ color: p.color, fontSize: "12px" }}>{p.name}</span>
          <span style={{ fontWeight: "700", fontSize: "12px" }}>{fmtMW(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, sub, tag }) {
  return (
    <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <h2 style={{ fontSize: "17px", fontWeight: "700", marginBottom: "2px" }}>{title}</h2>
        <p style={{ fontSize: "13px", color: "var(--muted)" }}>{sub}</p>
      </div>
      {tag && <Badge label={tag} color="info" />}
    </div>
  );
}

function Panel({ children, style = {} }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--surface-border)",
      borderRadius: "16px", padding: "28px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      ...style
    }}>{children}</div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--muted)", gap: "10px" }}>
      <div style={{
        width: "20px", height: "20px", border: "2px solid var(--surface-border)",
        borderTop: "2px solid var(--primary)", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }} />
      Loading…
    </div>
  );
}

// ─── Model Selector ───────────────────────────────────────────────────────────
function ModelSelector({ models, activeModel, onChange, loading }) {
  if (!models || models.length === 0) return null;
  const options = [{ key: "all", name: "All Models (Comparison)" }, ...models];
  const active = options.find(o => o.key === activeModel) || options[0];

  return (
    <div style={{ marginBottom: "24px", maxWidth: "400px" }}>
      <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
        🤖 Select Forecast Model
      </div>
      <select
        value={activeModel}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: "10px",
          background: "var(--surface)", border: "1px solid var(--surface-border)",
          color: "var(--foreground)", fontSize: "15px", fontWeight: "600",
          outline: "none", cursor: loading ? "not-allowed" : "pointer",
          appearance: "none", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"white\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
          backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 12px) center",
        }}
      >
        {options.map(m => {
          let suffix = "";
          if (m.key !== "all" && !m.loaded) {
            suffix = m.error ? ` (❌ Failed: ${m.error.split(",")[0].slice(0, 25)})` : " (⏳ Loading...)";
          }
          return (
            <option key={m.key} value={m.key} disabled={m.key !== "all" && !m.loaded}>
              {m.name}{suffix}
            </option>
          );
        })}
      </select>
      {activeModel !== "all" && active.error && (
        <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "8px" }}>
          ⚠ {active.error.slice(0, 100)}
        </div>
      )}
    </div>
  );
}

// ─── 24h Forecast Panel ───────────────────────────────────────────────────────
function Forecast24h({ data, models }) {
  if (!data) return <Spinner />;
  const { slots, summary, model } = data;
  const isAll = model === "all";

  const chartData = slots.map(s => {
    const p = {
      label: s.label,
      p10: s.p10,
      p50: s.p50,
      p90: s.p90,
      low: s.low_demand,
    };
    if (isAll) {
      Object.keys(s).filter(k => k.endsWith("_p50")).forEach(k => p[k] = s[k]);
    }
    return p;
  });

  return (
    <>
      <SectionHeader
        title={isAll ? "24-Hour Ahead Forecast (All Models)" : "24-Hour Ahead Forecast"}
        sub="Hourly P10 / P50 / P90 quantile bands — updated every hour"
        tag={`Avg confidence ${data.summary?.avg_confidence}%`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "28px" }}>
        <KpiCard title="Peak Demand" value={fmtMW(summary.peak_mw)} sub={`at ${summary.peak_hour}`} icon="⚡" accent="#f59e0b" />
        <KpiCard title="Trough Demand" value={fmtMW(summary.trough_mw)} sub={`at ${summary.trough_hour}`} icon="🌙" accent="#3b82f6" />
        <KpiCard title="Avg Demand" value={fmtMW(summary.avg_demand_mw)} sub="next 24 hours" icon="📊" accent="#10b981" />
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} interval={2} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} />
          {isAll && <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} />}
          <ReferenceLine y={16500} stroke="#ef4444" strokeDasharray="4 2"
            label={{ value: "Capacity", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
          {!isAll && <Area type="monotone" dataKey="p90" name="P90" stroke="#93c5fd" strokeWidth={1} fill="url(#bandFill)" strokeDasharray="4 2" />}
          {!isAll && <Area type="monotone" dataKey="p10" name="P10" stroke="#93c5fd" strokeWidth={1} fill="none" strokeDasharray="4 2" />}
          
          {isAll ? (
            Object.keys(chartData[0] || {}).filter(k => k.endsWith("_p50")).map((key, i) => {
              const modelKey = key.replace("_p50", "");
              const modelInfo = models?.find(m => m.key === modelKey);
              const displayName = modelInfo ? modelInfo.name : modelKey;
              const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e"];
              const color = MODEL_COLORS[modelKey]?.accent || colors[i % colors.length];
              return <Area key={key} type="monotone" dataKey={key} name={displayName} stroke={color} strokeWidth={2} fill="none" dot={false} />;
            })
          ) : (
            <Area type="monotone" dataKey="p50" name="P50 (median)" stroke="#3b82f6" strokeWidth={2.5} fill="none" dot={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Hourly table */}
      <div style={{ marginTop: "24px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--surface-border)" }}>
              {["Hour", "P10", "P50", "P90", "Confidence", "Flag"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--muted)", fontWeight: "600", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map(s => (
              <tr key={s.hour} style={{ borderBottom: "1px solid var(--surface-border)", background: s.low_demand ? "rgba(16,185,129,0.04)" : "transparent" }}>
                <td style={{ padding: "8px 10px", fontWeight: "600", color: "var(--foreground)" }}>{s.label}</td>
                <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{fmtMW(s.p10)}</td>
                <td style={{ padding: "8px 10px", fontWeight: "700" }}>{fmtMW(s.p50)}</td>
                <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{fmtMW(s.p90)}</td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "50px", height: "4px", background: "var(--surface-border)", borderRadius: "2px" }}>
                      <div style={{ width: `${s.confidence * 100}%`, height: "100%", background: s.confidence > 0.9 ? "#10b981" : "#f59e0b", borderRadius: "2px" }} />
                    </div>
                    <span style={{ color: "var(--muted)" }}>{(s.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {s.supply_gap  && <Badge label="Supply Risk" color="critical" />}
                  {s.low_demand  && <Badge label="Off-Peak" color="success" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 7-Day Forecast Panel ─────────────────────────────────────────────────────
function Forecast7Day({ data }) {
  if (!data) return <Spinner />;
  const { days, summary } = data;
  const chartData = days.map(d => ({ label: d.day_name, peak: d.peak_mw, mean: d.mean_mw, trough: d.trough_mw }));

  return (
    <>
      <SectionHeader
        title="7-Day Rolling Forecast"
        sub="Daily demand outlook for unit commitment and maintenance planning"
        tag={`Best maintenance: ${summary.best_maintenance_day}`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "28px" }}>
        <KpiCard title="Best Maintenance Window" value={summary.best_maintenance_day} sub={summary.best_maintenance_date} icon="🔧" accent="#8b5cf6" />
        <KpiCard title="Max Units Needed" value={`${summary.max_units_needed} units`} sub="peak commitment" icon="⚙️" accent="#f59e0b" />
        <KpiCard title="High-Demand Days" value={`${summary.procurement_days.length} days`} sub={summary.procurement_days.join(", ") || "None"} icon="📦" accent="#ef4444" />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="peak" name="Peak" fill="#3b82f6" radius={[4,4,0,0]} />
          <Bar dataKey="mean" name="Mean" fill="#93c5fd" radius={[4,4,0,0]} />
          <Bar dataKey="trough" name="Trough" fill="#dbeafe" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "8px" }}>
        {days.map(d => (
          <div key={d.day} style={{
            background: d.maintenance_ok ? "rgba(139,92,246,0.06)" : "var(--accent)",
            border: `1px solid ${d.maintenance_ok ? "#c4b5fd" : "var(--surface-border)"}`,
            borderRadius: "10px", padding: "12px 8px", textAlign: "center"
          }}>
            <div style={{ fontWeight: "700", fontSize: "13px" }}>{d.day_name}</div>
            <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "6px" }}>{d.date.slice(5)}</div>
            <div style={{ fontSize: "11px", fontWeight: "600" }}>{fmtMW(d.peak_mw)}</div>
            <div style={{ fontSize: "10px", color: "var(--muted)" }}>peak</div>
            {d.maintenance_ok && <div style={{ marginTop: "6px" }}><Badge label="Maint OK" color="info" /></div>}
            {d.procurement_flag && <div style={{ marginTop: "6px" }}><Badge label="High Demand" color="elevated" /></div>}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Peak Hours Panel ─────────────────────────────────────────────────────────
function PeakHours({ data }) {
  if (!data) return <Spinner />;
  const { days } = data;
  const today = days[0];
  const COLORS = { critical: "#ef4444", high: "#f97316", elevated: "#eab308" };

  return (
    <>
      <SectionHeader
        title="Peak Hour Prediction"
        sub="Top-3 demand spike hours — pre-stage reserves before the spike hits"
        tag="Reserve readiness"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        {today.peaks.map(p => (
          <div key={p.rank} style={{
            border: `1px solid ${COLORS[p.severity]}40`,
            borderLeft: `4px solid ${COLORS[p.severity]}`,
            borderRadius: "12px", padding: "18px 20px",
            background: `${COLORS[p.severity]}08`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--muted)" }}>Rank #{p.rank}</span>
              <Badge label={p.severity} color={p.severity} />
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", color: COLORS[p.severity] }}>{p.hour}</div>
            <div style={{ fontSize: "14px", fontWeight: "700", margin: "6px 0" }}>{fmtMW(p.demand_mw)}</div>
            <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "10px", marginTop: "10px" }}>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>Reserve required</div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS[p.severity] }}>{fmtMW(p.reserve_mw)}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>{p.action}</div>
            </div>
          </div>
        ))}
      </div>
      {days.length > 1 && (
        <div style={{ marginTop: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--muted)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>7-Day Peak Overview</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {days.slice(1).map(d => (
              <div key={d.date} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: "var(--accent)", borderRadius: "8px"
              }}>
                <span style={{ fontWeight: "600", fontSize: "13px", minWidth: "40px" }}>{d.day_name}</span>
                <span style={{ color: "var(--muted)", fontSize: "12px" }}>{d.date}</span>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>{fmtMW(d.absolute_peak_mw)}</span>
                <span style={{ color: "var(--muted)", fontSize: "12px" }}>at {d.absolute_peak_hour}</span>
                <Badge label={d.peaks[0]?.severity} color={d.peaks[0]?.severity} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Off-Peak Windows Panel ────────────────────────────────────────────────────
function OffPeak({ data }) {
  if (!data) return <Spinner />;
  const { windows, summary, daily_peak_mw, offpeak_threshold_mw } = data;

  return (
    <>
      <SectionHeader
        title="Off-Peak Window Prediction"
        sub="Low-demand windows for curtailment, battery charging & storage dispatch"
        tag={`Est. saving ${fmtMW(summary.est_saving_mw)}`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "24px" }}>
        <KpiCard title="Off-Peak Windows" value={`${summary.total_windows} windows`} sub={`${summary.total_offpeak_hours}h total`} icon="🌙" accent="#10b981" />
        <KpiCard title="Longest Window" value={`${summary.longest_window_h}h`} sub="continuous low demand" icon="⏱️" accent="#3b82f6" />
        <KpiCard title="Est. Curtailment Saving" value={fmtMW(summary.est_saving_mw)} sub="vs peak generation" icon="💰" accent="#8b5cf6" />
      </div>

      {windows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
          No significant off-peak windows today — high demand day.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {windows.map((w, i) => {
            const fillPct = 100 - (w.avg_mw / daily_peak_mw * 100);
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "160px 1fr 180px",
                alignItems: "center", gap: "20px",
                background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: "12px", padding: "16px 20px"
              }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#10b981" }}>
                    {w.start_hour} – {w.end_hour}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{w.duration_h}h window</div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                    <span>Avg {fmtMW(w.avg_mw)}</span>
                    <span>{w.depth_pct}% below peak</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", background: "var(--surface-border)", borderRadius: "3px" }}>
                    <div style={{ width: `${fillPct}%`, height: "100%", background: "#10b981", borderRadius: "3px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#10b981", marginTop: "4px" }}>{w.use_case}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>Saving potential</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#10b981" }}>{fmtMW(w.saving_est_mw)}</div>
                  <Badge label="Storage dispatch" color="success" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{
        marginTop: "20px", padding: "14px 18px",
        background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: "10px", fontSize: "13px", color: "var(--muted)"
      }}>
        <strong style={{ color: "var(--foreground)" }}>Threshold:</strong> Off-peak defined as demand below{" "}
        <strong style={{ color: "#3b82f6" }}>{fmtMW(offpeak_threshold_mw)}</strong>{" "}
        (60% of today's peak {fmtMW(daily_peak_mw)})
      </div>
    </>
  );
}


// ─── Explainability Panel: SHAP and LIME XAI ──────────────────────────────────
function XAIExplainPanel({ activeModel }) {
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedWeekday, setSelectedWeekday] = useState(0);
  const [explainData, setExplainData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/explain?model=${activeModel}&hour=${selectedHour}&weekday=${selectedWeekday}`)
      .then((r) => r.json())
      .then((d) => {
        setExplainData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeModel, selectedHour, selectedWeekday]);

  const weekdays = [
    { value: 0, label: "Monday" },
    { value: 1, label: "Tuesday" },
    { value: 2, label: "Wednesday" },
    { value: 3, label: "Thursday" },
    { value: 4, label: "Friday" },
    { value: 5, label: "Saturday" },
    { value: 6, label: "Sunday" },
  ];

  return (
    <>
      <SectionHeader
        title="Explainable AI (XAI) Insights"
        sub="Understand exactly what features drive model predictions via SHAP and LIME values"
        tag="XAI Enabled"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "32px" }}>
        <div>
          <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "6px" }}>
            ⏰ Target Prediction Hour
          </label>
          <select
            value={selectedHour}
            onChange={(e) => setSelectedHour(parseInt(e.target.value))}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: "10px",
              background: "var(--surface)", border: "1px solid var(--surface-border)",
              color: "var(--foreground)", fontSize: "14px", fontWeight: "600", outline: "none"
            }}
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <option key={h} value={h}>{`${h.toString().padStart(2, "0")}:00`}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "6px" }}>
            📅 Target Weekday
          </label>
          <select
            value={selectedWeekday}
            onChange={(e) => setSelectedWeekday(parseInt(e.target.value))}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: "10px",
              background: "var(--surface)", border: "1px solid var(--surface-border)",
              color: "var(--foreground)", fontSize: "14px", fontWeight: "600", outline: "none"
            }}
          >
            {weekdays.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && !explainData ? (
        <Spinner />
      ) : explainData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {/* Explanation Summary Card */}
          <div style={{
            background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.25)",
            borderRadius: "14px", padding: "18px 24px", display: "flex", alignItems: "center", gap: "16px"
          }}>
            <span style={{ fontSize: "28px" }}>💡</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#8b5cf6", marginBottom: "2px" }}>AI Interpretation</div>
              <div style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: "500" }}>{explainData.summary}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
            {/* SHAP section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🎯</span> SHAP Impact (Global Features)
                </h3>
                <Badge label={`Base load: ${explainData.base_value}`} color="info" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {explainData.shap_values?.map((item, i) => {
                  const pct = Math.min(100, Math.abs((item.impact / 1.0) * 100));
                  const isPos = item.impact >= 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                        <span style={{ fontWeight: "600", color: "var(--foreground)" }}>{item.feature}</span>
                        <span style={{ fontWeight: "700", color: isPos ? "#10b981" : "#ef4444" }}>
                          {isPos ? "+" : ""}{item.impact.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--surface-border)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: isPos ? "linear-gradient(to right, #10b981, #34d399)" : "linear-gradient(to right, #ef4444, #f87171)",
                          borderRadius: "4px", float: isPos ? "left" : "right"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LIME section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🧩</span> LIME Explanations (Local Model Fit)
                </h3>
                <Badge label="Local Interpretation" color="success" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {explainData.lime_explanations?.map((item, i) => {
                  const pct = Math.min(100, Math.abs((item.coefficient / 1.0) * 100));
                  const isPos = item.coefficient >= 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                        <span style={{ fontWeight: "600", color: "var(--foreground)" }}>{item.feature}</span>
                        <span style={{ fontWeight: "700", color: isPos ? "#3b82f6" : "#f59e0b" }}>
                          {isPos ? "+" : ""}{item.coefficient.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--surface-border)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: isPos ? "linear-gradient(to right, #3b82f6, #60a5fa)" : "linear-gradient(to right, #f59e0b, #fbbf24)",
                          borderRadius: "4px", float: isPos ? "left" : "right"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Premium Disclaimer Footnote */}
          <div style={{
            marginTop: "12px", padding: "14px 18px",
            background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
            borderRadius: "10px", fontSize: "12px", color: "var(--muted)"
          }}>
            <strong style={{ color: "var(--foreground)" }}>Explainability Note:</strong> SHAP (Shapley Additive exPlanations) uses game-theoretic weights to measure direct contribution toward predictions. LIME fits local surrogate models around specific hourly context. Together, they provide both global and localized operational insights.
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ForecastingPage() {
  const [tab, setTab] = useState("24h");
  const [activeModel, setActiveModel] = useState("synthetic");
  const [models, setModels] = useState([]);
  const [data24h, setData24h]   = useState(null);
  const [data7d,  setData7d]    = useState(null);
  const [dataPeak, setDataPeak] = useState(null);
  const [dataOff,  setDataOff]  = useState(null);
  const [loading, setLoading]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // Fetch model registry
  useEffect(() => {
    fetch(`${API}/models`)
      .then(r => r.json())
      .then(d => setModels(d.models || []))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async (modelKey) => {
    const m = modelKey || activeModel;
    setLoading(true);
    setError(null);
    try {
      const qs = `model=${m}`;
      const [r24h, r7d, rPeak, rOff] = await Promise.all([
        fetch(`${API}/24h?${qs}`).then(r => r.json()),
        fetch(`${API}/7day?${qs}`).then(r => r.json()),
        fetch(`${API}/peak-hours?days=7&${qs}`).then(r => r.json()),
        fetch(`${API}/offpeak?${qs}`).then(r => r.json()),
      ]);
      setData24h(r24h);
      setData7d(r7d);
      setDataPeak(rPeak);
      setDataOff(rOff);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Cannot reach backend — make sure FastAPI is running on port 8000.");
    }
    setLoading(false);
  }, [activeModel]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleModelChange = (key) => {
    setActiveModel(key);
    setData24h(null); setData7d(null); setDataPeak(null); setDataOff(null);
    refresh(key);
  };

  const activeModelInfo = models.find(m => m.key === activeModel);

  const TABS = [
    { id: "24h",    label: "24h Forecast",    icon: "⏱️" },
    { id: "7day",   label: "7-Day Outlook",   icon: "📅" },
    { id: "peak",   label: "Peak Hours",      icon: "⚡" },
    { id: "offpeak",label: "Off-Peak Windows",icon: "🌙" },
    { id: "explain",label: "XAI Insights",     icon: "🔬" },
  ];

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: "800", letterSpacing: "-0.02em" }}>Forecasting & Prediction</h1>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              display: "inline-block", width: "7px", height: "7px", borderRadius: "50%",
              background: (MODEL_COLORS[activeModel] || MODEL_COLORS.synthetic).accent,
              boxShadow: `0 0 6px ${(MODEL_COLORS[activeModel] || MODEL_COLORS.synthetic).accent}80`,
            }} />
            {activeModelInfo?.name || "Synthetic Baseline"} · {lastUpdated ? `Updated ${lastUpdated}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "var(--primary)", color: "#fff",
            border: "none", borderRadius: "10px", padding: "10px 18px",
            fontWeight: "600", fontSize: "13px", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1, transition: "opacity 0.2s"
          }}
        >
          {loading
            ? <span style={{ width: "14px", height: "14px", border: "2px solid #fff", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            : "↻"}
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px 18px", color: "#dc2626", fontSize: "13px", marginBottom: "24px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Model selector */}
      <ModelSelector models={models} activeModel={activeModel} onChange={handleModelChange} loading={loading} />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "6px", background: "var(--accent)", padding: "4px", borderRadius: "12px", marginBottom: "28px", width: "fit-content" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 18px", borderRadius: "9px", fontSize: "13px",
              fontWeight: "600", cursor: "pointer", border: "none",
              background: tab === t.id ? "var(--surface)" : "transparent",
              color: tab === t.id ? "var(--primary)" : "var(--muted)",
              boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.18s ease",
              display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Content panels */}
      <Panel>
        {tab === "24h"     && <Forecast24h data={data24h} models={models} />}
        {tab === "7day"    && <Forecast7Day data={data7d} models={models} />}
        {tab === "peak"    && <PeakHours data={dataPeak} />}
        {tab === "offpeak" && <OffPeak data={dataOff} />}
        {tab === "explain" && <XAIExplainPanel activeModel={activeModel} />}
      </Panel>
    </div>
  );
}
