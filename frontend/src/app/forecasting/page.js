"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Cell, Legend
} from "recharts";
import Card from "@/components/Card";

const API = "http://localhost:8000/api/forecast";

// ─── Model type colors ────────────────────────────────────────────────────────
const MODEL_COLORS = {
  synthetic:      { accent: "var(--primary)", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)" },
  lgbm:           { accent: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)" },
  tcn_xgb:        { accent: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  adani_catboost: { accent: "#ec4899", bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.25)" },
  adani_lightgbm: { accent: "#06b6d4", bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.25)" },
  adani_prophet:  { accent: "#f43f5e", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.25)" },
  adani_stacking: { accent: "#84cc16", bg: "rgba(132,204,22,0.08)", border: "rgba(132,204,22,0.25)" },
  adani_ultimate: { accent: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)" },
  adani_voting:   { accent: "#14b8a6", bg: "rgba(20,184,166,0.08)", border: "rgba(20,184,166,0.25)" },
  adani_xgboost:  { accent: "#d946ef", bg: "rgba(217,70,239,0.08)", border: "rgba(217,70,239,0.25)" },
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const fmtMW = (n) => `${fmt(n)} MW`;

function Badge({ label, color }) {
  const colors = {
    critical: { bg: "rgba(192, 57, 43, 0.1)", text: "var(--danger)", border: "var(--danger)" },
    high:     { bg: "rgba(230, 126, 34, 0.1)", text: "var(--warning)", border: "var(--warning)" },
    elevated: { bg: "rgba(241, 196, 15, 0.1)", text: "#ca8a04", border: "#fef08a" },
    success:  { bg: "rgba(39, 174, 96, 0.1)", text: "var(--success)", border: "var(--success)" },
    info:     { bg: "var(--accent)", text: "var(--primary)", border: "var(--surface-border)" },
  };
  const c = colors[color] || colors.info;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em"
    }}>{label}</span>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--surface-border)",
      borderRadius: "8px", padding: "12px 16px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
    }}>
      <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "8px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "24px", marginBottom: "6px" }}>
          <span style={{ color: p.color, fontSize: "12px", fontWeight: "500" }}>{p.name}</span>
          <span style={{ fontWeight: "700", fontSize: "12px", color: "var(--foreground)" }}>{fmtMW(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, sub, tag }) {
  return (
    <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <h2 className="serif" style={{ fontSize: "22px", fontWeight: "400", marginBottom: "4px" }}>{title}</h2>
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
      borderRadius: "var(--radius)", padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
      ...style
    }}>{children}</div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "var(--muted)", gap: "12px" }}>
      <div style={{
        width: "18px", height: "18px", border: "2px solid var(--surface-border)",
        borderTop: "2px solid var(--primary)", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }} />
      <span style={{ fontSize: "13px", fontWeight: "500" }}>Analyzing grid data…</span>
    </div>
  );
}

// ─── Model Selector ───────────────────────────────────────────────────────────
function ModelSelector({ models, activeModel, onChange, loading }) {
  if (!models || models.length === 0) return null;
  const options = [{ key: "all", name: "Multi-Model Comparison" }, ...models];
  const active = options.find(o => o.key === activeModel) || options[0];

  return (
    <div style={{ marginBottom: "32px", maxWidth: "480px" }}>
      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
        Forecast Architecture
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
          {options.map(m => {
            let suffix = "";
            if (m.key !== "all" && !m.loaded) {
              suffix = m.error ? ` (❌ Conflict)` : " (⏳ Syncing...)";
            }
            return (
              <option key={m.key} value={m.key} disabled={m.key !== "all" && !m.loaded}>
                {m.name}{suffix}
              </option>
            );
          })}
        </select>
        <div style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted)", fontSize: "10px" }}>▼</div>
      </div>
      {activeModel !== "all" && active.error && (
        <div style={{ fontSize: "11px", color: "var(--danger)", marginTop: "8px", fontWeight: "500" }}>
          ⚠ Service unavailable: {active.error.split(',')[0]}
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
        title={isAll ? "Composite Forecast Analysis" : "24-Hour Ahead Forecast"}
        sub={isAll ? "Overlay of all deployed operational models" : "Hourly P10 / P50 / P90 quantile bands"}
        tag={`Avg confidence ${data.summary?.avg_confidence}%`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "48px" }}>
        <Card title="Peak Demand" value={fmtMW(summary.peak_mw)} subtext={`at ${summary.peak_hour}`} accentColor="var(--warning)" />
        <Card title="Trough Demand" value={fmtMW(summary.trough_mw)} subtext={`at ${summary.trough_hour}`} accentColor="var(--primary)" />
        <Card title="Avg Demand" value={fmtMW(summary.avg_demand_mw)} subtext="Next 24 hours" accentColor="var(--success)" />
      </div>
      
      <div style={{ height: 360, marginBottom: "48px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} interval={2} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
            <Tooltip content={<ChartTooltip />} />
            {isAll && <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }} />}
            <ReferenceLine y={16500} stroke="var(--danger)" strokeDasharray="4 2"
              label={{ value: "Grid Capacity", fill: "var(--danger)", fontSize: 10, position: "insideTopRight", fontWeight: "700" }} />
            
            {!isAll && <Area type="monotone" dataKey="p90" name="P90" stroke="var(--primary)" strokeWidth={1} fill="url(#bandFill)" strokeOpacity={0.2} strokeDasharray="4 2" />}
            {!isAll && <Area type="monotone" dataKey="p10" name="P10" stroke="var(--primary)" strokeWidth={1} fill="none" strokeOpacity={0.2} strokeDasharray="4 2" />}
            
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
              <Area type="monotone" dataKey="p50" name="P50 (median)" stroke="var(--primary)" strokeWidth={2.5} fill="none" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--surface-border)" }}>
              {["Hour", "P10", "P50", "P90", "Model confidence", "Flag"].map(h => (
                <th key={h} style={{ padding: "12px 10px", textAlign: "left", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map(s => (
              <tr key={s.hour} style={{ borderBottom: "1px solid var(--surface-border)", background: s.low_demand ? "var(--accent)" : "transparent" }}>
                <td style={{ padding: "12px 10px", fontWeight: "600", color: "var(--foreground)" }}>{s.label}</td>
                <td style={{ padding: "12px 10px", color: "var(--muted)" }}>{fmtMW(s.p10)}</td>
                <td style={{ padding: "12px 10px", fontWeight: "600" }}>{fmtMW(s.p50)}</td>
                <td style={{ padding: "12px 10px", color: "var(--muted)" }}>{fmtMW(s.p90)}</td>
                <td style={{ padding: "12px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "60px", height: "4px", background: "var(--surface-border)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ width: `${s.confidence * 100}%`, height: "100%", background: "var(--primary)", opacity: 0.8 }} />
                    </div>
                    <span style={{ color: "var(--muted)", fontSize: "10px" }}>{(s.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td style={{ padding: "12px 10px" }}>
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
        title="7-Day Strategic Outlook"
        sub="Long-term demand trends and unit commitment planning"
        tag={`Maint. window: ${summary.best_maintenance_day}`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "48px" }}>
        <Card title="Best Maintenance" value={summary.best_maintenance_day} subtext={summary.best_maintenance_date} accentColor="var(--primary)" />
        <Card title="Peak Commitment" value={`${summary.max_units_needed}`} subtext="Units required" accentColor="var(--warning)" />
        <Card title="Critical Window" value={`${summary.procurement_days.length} days`} subtext="High-procurement period" accentColor="var(--danger)" />
      </div>
      <div style={{ height: 320, marginBottom: "48px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={fmt} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="peak" name="Peak Demand" fill="var(--primary)" radius={[4,4,0,0]} barSize={32} />
            <Bar dataKey="mean" name="Mean Demand" fill="var(--primary)" opacity={0.15} radius={[4,4,0,0]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "16px" }}>
        {days.map(d => (
          <div key={d.day} style={{
            background: d.maintenance_ok ? "rgba(39, 174, 96, 0.05)" : "var(--surface)",
            border: d.maintenance_ok ? "1px solid var(--success)" : "1px solid var(--surface-border)",
            borderRadius: "12px", padding: "20px 12px", textAlign: "center", transition: "all 0.2s"
          }}>
            <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "4px" }}>{d.day_name}</div>
            <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "12px", textTransform: "uppercase" }}>{d.date.split('-').slice(1).join('/')}</div>
            <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>{fmtMW(d.peak_mw)}</div>
            {d.maintenance_ok && <Badge label="OK" color="success" />}
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
  const COLORS = { critical: "var(--danger)", high: "var(--warning)", elevated: "#ca8a04" };

  return (
    <>
      <SectionHeader
        title="Predictive Peak Spikes"
        sub="Forecasted grid stress points and reserve requirements"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "24px", marginBottom: "48px" }}>
        {today.peaks.map(p => (
          <div key={p.rank} style={{
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius)", padding: "28px",
            background: "var(--surface)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Priority #{p.rank}</span>
              <Badge label={p.severity} color={p.severity} />
            </div>
            <div style={{ fontSize: "36px", fontWeight: "400", color: "var(--foreground)", marginBottom: "4px" }} className="serif">{p.hour}</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--foreground)", marginBottom: "24px" }}>{fmtMW(p.demand_mw)}</div>
            <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "20px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.05em", marginBottom: "6px" }}>Reserve Required</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: COLORS[p.severity] }}>{fmtMW(p.reserve_mw)}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "12px", lineHeight: "1.6" }}>{p.action}</div>
            </div>
          </div>
        ))}
      </div>
      {days.length > 1 && (
        <div>
          <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>7-Day Stress Outlook</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {days.slice(1).map(d => (
              <div key={d.date} style={{
                display: "grid", gridTemplateColumns: "100px 100px 1fr 120px 120px",
                alignItems: "center", padding: "16px 24px", background: "var(--accent)", borderRadius: "10px", border: "1px solid var(--surface-border)"
              }}>
                <span style={{ fontWeight: "700", fontSize: "13px" }}>{d.day_name}</span>
                <span style={{ color: "var(--muted)", fontSize: "11px" }}>{d.date}</span>
                <span style={{ fontWeight: "700", fontSize: "14px" }}>{fmtMW(d.absolute_peak_mw)}</span>
                <span style={{ color: "var(--muted)", fontSize: "11px", textAlign: "right" }}>Peak at {d.absolute_peak_hour}</span>
                <div style={{ textAlign: "right" }}>
                  <Badge label={d.peaks[0]?.severity} color={d.peaks[0]?.severity} />
                </div>
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
        title="Operational Off-Peak Windows"
        sub="Dispatch windows optimized for storage and non-critical maintenance"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "48px" }}>
        <Card title="Available Slots" value={`${summary.total_windows}`} subtext={`${summary.total_offpeak_hours}h combined`} accentColor="var(--success)" />
        <Card title="Max Window" value={`${summary.longest_window_h}h`} subtext="Continuous duration" accentColor="var(--primary)" />
        <Card title="Saving Capacity" value={fmtMW(summary.est_saving_mw)} subtext="Est. MW-h potential" accentColor="var(--success)" />
      </div>

      {windows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px", background: "var(--accent)", borderRadius: "var(--radius)" }}>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>No significant low-demand windows forecasted for this cycle.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {windows.map((w, i) => {
            const fillPct = 100 - (w.avg_mw / daily_peak_mw * 100);
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "200px 1fr 220px",
                alignItems: "center", gap: "40px",
                background: "var(--surface)", border: "1px solid var(--surface-border)",
                borderRadius: "var(--radius)", padding: "28px 32px", transition: "all 0.2s"
              }}>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "400", color: "var(--foreground)" }} className="serif">
                    {w.start_hour} – {w.end_hour}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px", fontWeight: "600", textTransform: "uppercase" }}>{w.duration_h}h available</div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>
                    <span style={{ fontWeight: "600" }}>Avg {fmtMW(w.avg_mw)}</span>
                    <span style={{ fontWeight: "600" }}>{w.depth_pct}% DEPTH</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", background: "var(--accent)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${fillPct}%`, height: "100%", background: "var(--success)", opacity: 0.8 }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--success)", fontWeight: "700", marginTop: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{w.use_case}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: "700", marginBottom: "6px" }}>Curtailment Potential</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--foreground)", marginBottom: "12px" }}>{fmtMW(w.saving_est_mw)}</div>
                  <Badge label="Dispatch Ready" color="success" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{
        marginTop: "40px", padding: "20px 24px",
        background: "var(--accent)", borderRadius: "12px", fontSize: "12px", color: "var(--muted)", border: "1px solid var(--surface-border)"
      }}>
        <strong style={{ color: "var(--foreground)" }}>Algorithm Note:</strong> Off-peak threshold is dynamically calibrated to <span style={{ color: "var(--primary)", fontWeight: "700" }}>{fmtMW(offpeak_threshold_mw)}</span> based on rolling 30-day baseline.
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
        title="Interpretability Analytics"
        sub="Audit-ready feature attribution via SHAP (Global) and LIME (Local) methodologies"
        tag="XAI Core Enabled"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "40px" }}>
        <div>
          <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: "8px" }}>
            Operational Hour
          </label>
          <select
            value={selectedHour}
            onChange={(e) => setSelectedHour(parseInt(e.target.value))}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: "10px",
              background: "var(--surface)", border: "1px solid var(--surface-border)",
              color: "var(--foreground)", fontSize: "14px", fontWeight: "600", outline: "none"
            }}
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <option key={h} value={h}>{`${h.toString().padStart(2, "0")}:00 HRS`}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: "8px" }}>
            Temporal Context
          </label>
          <select
            value={selectedWeekday}
            onChange={(e) => setSelectedWeekday(parseInt(e.target.value))}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: "10px",
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
        <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
          
          <div style={{
            background: "rgba(59,130,246,0.04)", border: "1px solid var(--surface-border)",
            borderRadius: "14px", padding: "24px 32px", display: "flex", alignItems: "center", gap: "24px"
          }}>
            <span style={{ fontSize: "32px" }}>💡</span>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>AI Operational Logic</div>
              <div style={{ fontSize: "15px", color: "var(--foreground)", fontWeight: "500", lineHeight: "1.6" }}>{explainData.summary}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px" }}>
            {/* SHAP section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h3 className="serif" style={{ fontSize: "18px", fontWeight: "400", display: "flex", alignItems: "center", gap: "10px" }}>
                  Feature Attribution (SHAP)
                </h3>
                <Badge label={`Base: ${explainData.base_value}`} color="info" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {explainData.shap_values?.map((item, i) => {
                  const pct = Math.min(100, Math.abs((item.impact / 1.0) * 100));
                  const isPos = item.impact >= 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                        <span style={{ fontWeight: "500", color: "var(--foreground)" }}>{item.feature}</span>
                        <span style={{ fontWeight: "700", color: isPos ? "var(--success)" : "var(--danger)" }}>
                          {isPos ? "+" : ""}{item.impact.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "var(--accent)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: isPos ? "var(--success)" : "var(--danger)",
                          opacity: 0.6,
                          borderRadius: "3px", float: isPos ? "left" : "right"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LIME section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h3 className="serif" style={{ fontSize: "18px", fontWeight: "400", display: "flex", alignItems: "center", gap: "10px" }}>
                  Local Fit Integrity (LIME)
                </h3>
                <Badge label="Local Audit" color="success" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {explainData.lime_explanations?.map((item, i) => {
                  const pct = Math.min(100, Math.abs((item.coefficient / 1.0) * 100));
                  const isPos = item.coefficient >= 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                        <span style={{ fontWeight: "500", color: "var(--foreground)" }}>{item.feature}</span>
                        <span style={{ fontWeight: "700", color: isPos ? "var(--primary)" : "var(--warning)" }}>
                          {isPos ? "+" : ""}{item.coefficient.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "var(--accent)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: isPos ? "var(--primary)" : "var(--warning)",
                          opacity: 0.6,
                          borderRadius: "3px", float: isPos ? "left" : "right"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
      setError("Forecasting engine connection failed. Verify operational telemetry stream.");
    }
    setLoading(false);
  }, [activeModel]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleModelChange = (key) => {
    setActiveModel(key);
    setData24h(null); setData7d(null); setDataPeak(null); setDataOff(null);
    refresh(key);
  };

  const TABS = [
    { id: "24h",    label: "24h Forecast" },
    { id: "7day",   label: "7-Day Outlook" },
    { id: "peak",   label: "Peak Spikes" },
    { id: "offpeak",label: "Off-Peak Windows" },
    { id: "explain",label: "Explainability (XAI)" },
  ];

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Forecasting</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>
            Operational load predictions · {lastUpdated ? `Last synchronized at ${lastUpdated}` : "Syncing..."}
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          style={{
            background: "var(--surface)", 
            color: "var(--foreground)",
            border: "1px solid var(--surface-border)", 
            borderRadius: "8px", 
            padding: "10px 24px",
            fontWeight: "600", fontSize: "13px", 
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1, transition: "all 0.2s"
          }}
        >
          {loading ? 'Refreshing...' : '↻ Refresh Data'}
        </button>
      </header>

      {error && (
        <div style={{ background: "rgba(192, 57, 43, 0.05)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "16px 24px", color: "var(--danger)", fontSize: "13px", marginBottom: "32px", fontWeight: "600" }}>
          {error}
        </div>
      )}

      <ModelSelector models={models} activeModel={activeModel} onChange={handleModelChange} loading={loading} />

      <div style={{ display: "flex", gap: "32px", borderBottom: "1px solid var(--surface-border)", marginBottom: "40px" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "16px 4px", fontSize: "13px",
              fontWeight: tab === t.id ? "700" : "500", 
              textTransform: "uppercase", letterSpacing: "0.1em",
              cursor: "pointer", border: "none",
              background: "transparent",
              color: tab === t.id ? "var(--foreground)" : "var(--muted)",
              borderBottom: tab === t.id ? "3px solid var(--primary)" : "3px solid transparent",
              transition: "all 0.2s ease"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Panel>
        {tab === "24h"     && <Forecast24h data={data24h} models={models} />}
        {tab === "7day"    && <Forecast7Day data={data7d} models={models} />}
        {tab === "peak"    && <PeakHours data={dataPeak} />}
        {tab === "offpeak" && <OffPeak data={dataOff} />}
        {tab === "explain" && <XAIExplainPanel activeModel={activeModel} />}
      </Panel>
      
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

