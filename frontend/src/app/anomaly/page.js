"use client";

import { useMemo } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Card from "@/components/Card";
import { RAW_DATA, computeStats, fmt } from "@/utils/mockData";

export default function AnomalyPage() {
  const data = RAW_DATA.Hourly;
  const stats = useMemo(() => computeStats(data), [data]);
  const anomalies = useMemo(() => data.filter(d => Math.abs(d.residual) > stats.std * 1.5), [data, stats]);

  return (
    <div>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Anomaly Detection & Explainability</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>Real-time spike alerts and residual tracking.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px", marginBottom: "40px" }}>
        {/* Main Chart */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "32px" }}>Residual Tracking (Actual - Predicted)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.slice(0, 72)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--surface-border)" }} />
              <Bar dataKey="residual" name="Residual Error" fill="var(--warning)" barSize={4}>
                {data.slice(0, 72).map((entry, index) => (
                  <cell key={`cell-${index}`} fill={Math.abs(entry.residual) > stats.std * 1.5 ? "var(--danger)" : "var(--primary)"} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="value" name="Actual Demand" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Q&A Assistant */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Ask Prometheus</h3>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", marginBottom: "16px" }}>
            <div style={{ background: "var(--accent)", padding: "12px", borderRadius: "8px", fontSize: "13px" }}>
              <strong>User:</strong> Why did consumption spike on 3 April at 4 PM?
            </div>
            <div style={{ background: "var(--primary)", color: "var(--primary-foreground)", padding: "12px", borderRadius: "8px", fontSize: "13px", lineHeight: "1.5" }}>
              <strong>Prometheus:</strong> Based on historical logs, temperature dropped by 5°C unexpectedly, triggering heating systems. Residual Z-score was +3.4. Features driving this: lag_24 (40%) and temperature (35%).
            </div>
          </div>
          <input type="text" placeholder="Ask about anomalies..." style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)" }} />
        </div>
      </div>

      <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Anomaly History Log</h3>
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "var(--accent)", color: "var(--muted)" }}>
              <th style={{ padding: "16px", fontWeight: "600" }}>Timestamp</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Deviation (MWh)</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Severity</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Root Cause</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.slice(0, 5).map((a, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--surface-border)" }}>
                <td style={{ padding: "16px" }}>{a.label}</td>
                <td style={{ padding: "16px", color: a.residual > 0 ? "var(--danger)" : "var(--success)", fontWeight: "600" }}>
                  {a.residual > 0 ? "+" : ""}{a.residual}
                </td>
                <td style={{ padding: "16px" }}>
                  <span style={{ padding: "4px 8px", background: "var(--danger)", color: "white", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>Critical</span>
                </td>
                <td style={{ padding: "16px", color: "var(--muted)" }}>Unexpected industrial load in Sector C</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
