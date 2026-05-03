"use client";

import Card from "@/components/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function InsightsPage() {
  const shapData = [
    { feature: "lag_1", contribution: 45 },
    { feature: "lag_24", contribution: 25 },
    { feature: "lag_168", contribution: 15 },
    { feature: "temperature", contribution: 8 },
    { feature: "is_weekend", contribution: 5 },
    { feature: "hour_sin", contribution: 2 },
  ];

  return (
    <div>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Cost & Waste Reduction Insights</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>Savings estimator, SHAP explainability, and trend analysis.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "40px" }}>
        <Card title="Estimated Savings (MTD)" value="$42,500" subtext="Avoided over-generation via forecast accuracy" type="success" />
        <Card title="Over-generation Warning" value="4 Hours Active" subtext="Upcoming windows where demand < committed generation" type="warning" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        {/* SHAP Panel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>SHAP Explainability Panel</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "4px" }}>Feature impact on the latest 24h forecast model.</p>
          </div>
          
          <ResponsiveContainer width="100%" height={300}>
            <BarChart layout="vertical" data={shapData} margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis type="category" dataKey="feature" axisLine={false} tickLine={false} tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 500 }} />
              <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--surface-border)" }} />
              <Bar dataKey="contribution" name="Contribution %" fill="var(--primary)" barSize={20} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Demand Trend Analysis */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "24px" }}>Long-Run Trend Analysis</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase" }}>Baseline Shift</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--success)" }}>-2.4% Annualized</div>
              <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px", lineHeight: "1.5" }}>Industrial demand in Sector C continues downward trajectory due to energy efficiency upgrades.</p>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "600", textTransform: "uppercase" }}>Pattern Shift</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--warning)" }}>Peak Flattening</div>
              <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px", lineHeight: "1.5" }}>Evening peaks are widening and flattening, likely driven by EV charging load distribution.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
