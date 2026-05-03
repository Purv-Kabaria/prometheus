"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Card from "@/components/Card";
import { RAW_DATA, fmt } from "@/utils/mockData";

export default function ReportingPage() {
  const data = RAW_DATA.Monthly;

  return (
    <div>
      <header style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Operational Intelligence & Reporting</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>Live actual vs predicted, seasonal patterns, and performance tracking.</p>
        <button style={{ background: "var(--primary)", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "14px" }}>
          Generate PDF Report
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "40px" }}>
        <Card title="Model MAE (7 days)" value="1.84%" subtext="Mean Absolute Error" type="success" />
        <Card title="Model RMSE (30 days)" value="2.15%" subtext="Root Mean Squared Error" />
        <Card title="Model MAPE (90 days)" value="1.92%" subtext="Mean Absolute Percentage Error" />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px", marginBottom: "40px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "24px" }}>Seasonal Pattern Tracker (30 Days)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip contentStyle={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--surface-border)" }} />
            <Area type="monotone" dataKey="value" stroke="var(--primary)" fillOpacity={0.1} fill="var(--primary)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "24px" }}>Automated Reports Archive</h3>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "var(--accent)", color: "var(--muted)" }}>
              <th style={{ padding: "16px", fontWeight: "600" }}>Report Name</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Date Generated</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Format</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Weekly Ops Summary", date: "2024-05-01" },
              { name: "April 2024 Monthly Review", date: "2024-04-30" },
              { name: "Weekly Ops Summary", date: "2024-04-24" }
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--surface-border)" }}>
                <td style={{ padding: "16px", fontWeight: "500", color: "var(--foreground)" }}>{r.name}</td>
                <td style={{ padding: "16px", color: "var(--muted)" }}>{r.date}</td>
                <td style={{ padding: "16px", color: "var(--muted)" }}>PDF Dashboard</td>
                <td style={{ padding: "16px" }}>
                  <button style={{ color: "var(--primary)", fontWeight: "600" }}>Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
