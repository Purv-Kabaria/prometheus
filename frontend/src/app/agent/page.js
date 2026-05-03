"use client";

import Card from "@/components/Card";

export default function AgentPage() {
  const proposals = [
    {
      id: "DEC-1042",
      action: "Reduce generation by 800 MWh",
      window: "02:00 - 05:00",
      confidence: 96.5,
      rationale: "Off-peak window detected. Weather forecast indicates warmer overnight temperatures, leading to 12% lower baseline heating demand.",
      status: "pending"
    },
    {
      id: "DEC-1043",
      action: "Schedule Turbine B Maintenance",
      window: "Saturday 12:00 - Sunday 20:00",
      confidence: 88.0,
      rationale: "Predicted demand is 15% below capacity limit. Lowest continuous 32-hour demand window in the upcoming 14 days.",
      status: "pending"
    }
  ];

  return (
    <div>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>Agent-Assisted Decisions</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>Human-in-loop decision proposals and maintenance scheduling.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {proposals.map(p => (
          <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "600", letterSpacing: "0.05em" }}>PROPOSAL {p.id}</span>
                <h3 style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px" }}>{p.action}</h3>
                <p style={{ fontSize: "14px", color: "var(--primary)", fontWeight: "500", marginTop: "4px" }}>Target Window: {p.window}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: "24px", fontWeight: "800", color: p.confidence > 90 ? "var(--success)" : "var(--warning)" }}>
                  {p.confidence}%
                </span>
                <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Model Confidence</span>
              </div>
            </div>

            <div style={{ background: "var(--accent)", padding: "16px", borderRadius: "8px", fontSize: "13px", lineHeight: "1.6", color: "var(--foreground)", marginBottom: "24px" }}>
              <strong>Rationale:</strong> {p.rationale}
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "var(--success)", color: "white", fontWeight: "600", fontSize: "14px" }}>Accept Proposal</button>
              <button style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--foreground)", fontWeight: "600", fontSize: "14px" }}>Reject & Correct</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
