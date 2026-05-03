"use client";

import { useMemo } from "react";
import Card from "@/components/Card";
import { RAW_DATA, computeStats, fmt } from "@/utils/mockData";

export default function OverviewPage() {
  const data = RAW_DATA.Daily;
  const stats = useMemo(() => computeStats(data), [data]);
  const anomalies = useMemo(() => data.filter(d => d.value > stats.mean + 2 * stats.std), [data, stats]);

  return (
    <div>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Platform Overview</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>Grid Officer Product Features and capabilities summary.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "40px", justifyContent: "center" }}>
        <Card title="Total Consumption" value={`${fmt(stats.total)} MWh`} subtext="Last 90 days" type="default" />
        <Card title="Peak Demand" value={`${fmt(stats.peak)} MWh`} subtext="Recorded yesterday at 14:00" type="warning" />
        <Card title="Avg Daily Load" value={`${fmt(stats.mean.toFixed(1))} MWh`} />
        <Card title="Detected Anomalies" value={anomalies.length} subtext="Requires review" type="danger" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div style={{ background: "var(--surface)", padding: "24px", borderRadius: "var(--radius)", border: "1px solid var(--surface-border)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Forecasting & Prediction</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "12px", color: "var(--muted)", fontSize: "14px", listStyle: "inside" }}>
            <li><strong style={{ color: "var(--foreground)" }}>24h Ahead Forecast:</strong> Hourly consumption predictions.</li>
            <li><strong style={{ color: "var(--foreground)" }}>7-Day Weekly Forecast:</strong> Rolling weekly outlook.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Peak Hour Prediction:</strong> Flags top 3 demand hours daily.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Off-Peak Window Prediction:</strong> Identifies low-demand windows.</li>
          </ul>
        </div>
        <div style={{ background: "var(--surface)", padding: "24px", borderRadius: "var(--radius)", border: "1px solid var(--surface-border)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Anomaly Detection & Explainability</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "12px", color: "var(--muted)", fontSize: "14px", listStyle: "inside" }}>
            <li><strong style={{ color: "var(--foreground)" }}>Real-time Spike Alerts:</strong> Immediate alerts on deviation.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Natural Language Q&A:</strong> RAG-powered query support.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Anomaly History Log:</strong> Searchable timeline of anomalies.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Residual Tracking:</strong> Live chart of actual minus predicted.</li>
          </ul>
        </div>
        <div style={{ background: "var(--surface)", padding: "24px", borderRadius: "var(--radius)", border: "1px solid var(--surface-border)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Agent-Assisted Decisions</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "12px", color: "var(--muted)", fontSize: "14px", listStyle: "inside" }}>
            <li><strong style={{ color: "var(--foreground)" }}>Decision Proposals:</strong> Recommended actions surfaced to officer.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Accept/Reject/Correct:</strong> One-click overriding.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Confidence Score:</strong> Model confidence % per proposal.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Maintenance Scheduling:</strong> Outage slot recommendations.</li>
          </ul>
        </div>
        <div style={{ background: "var(--surface)", padding: "24px", borderRadius: "var(--radius)", border: "1px solid var(--surface-border)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Insights & Reporting</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "12px", color: "var(--muted)", fontSize: "14px", listStyle: "inside" }}>
            <li><strong style={{ color: "var(--foreground)" }}>Live vs Predicted:</strong> Real-time charts overlay.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Seasonal Heatmap:</strong> Long-term pattern visualization.</li>
            <li><strong style={{ color: "var(--foreground)" }}>Cost & Waste:</strong> Savings estimator & over-generation alerts.</li>
            <li><strong style={{ color: "var(--foreground)" }}>SHAP Explainability:</strong> Feature contribution insights.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
