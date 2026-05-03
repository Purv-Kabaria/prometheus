"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";
import Card from "@/components/Card";
import { RAW_DATA, fmt } from "@/utils/mockData";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--surface-border)",
      borderRadius: "8px",
      padding: "12px",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
    }}>
      <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "8px" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "4px" }}>
          <span style={{ color: p.color, fontSize: "12px", fontWeight: "500" }}>{p.name}</span>
          <span style={{ color: "var(--foreground)", fontSize: "12px", fontWeight: "700" }}>{fmt(p.value)} MWh</span>
        </div>
      ))}
    </div>
  );
};

export default function ForecastingPage() {
  const [view, setView] = useState("24h");
  const data = view === "24h" ? RAW_DATA.Hourly.slice(0, 24) : RAW_DATA.Weekly;

  return (
    <div>
      <header style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Forecasting & Prediction</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "20px" }}>24h ahead and 7-day rolling weekly outlooks.</p>
        <div style={{ display: "flex", background: "var(--accent)", padding: "4px", borderRadius: "10px", gap: "4px" }}>
          {["24h", "7-day"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                transition: "all 0.2s",
                background: view === v ? "var(--surface)" : "transparent",
                color: view === v ? "var(--primary)" : "var(--muted)",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
              }}
            >
              {v} Outlook
            </button>
          ))}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "40px" }}>
        <Card title="Peak Hour Prediction" value={view === "24h" ? "14:00 & 19:00" : "Tuesday & Friday"} subtext="Pre-stage reserves before spikes" type="warning" />
        <Card title="Off-Peak Window" value={view === "24h" ? "02:00 - 05:00" : "Weekend Nights"} subtext="Optimal for battery charging" type="success" />
        <Card title="Forecast Confidence" value="94.2%" subtext="Based on lag_168 correlation" />
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
        borderRadius: "var(--radius)",
        padding: "32px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Predicted Demand Curve</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>Overlay of predicted vs baseline</p>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={view === "24h" ? 120 : 2500} label={{ position: 'top', value: 'Capacity Limit', fill: 'var(--danger)', fontSize: 11 }} stroke="var(--danger)" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="prediction" name="Predicted Demand" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorPred)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
