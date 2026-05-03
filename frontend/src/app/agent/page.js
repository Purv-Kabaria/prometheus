"use client";

import Card from "@/components/Card";

const ActionCard = ({ id, action, rationale, time, zone, confidence, priority }) => (
  <div style={{ 
    background: "var(--surface)", 
    border: "1px solid var(--surface-border)", 
    borderRadius: "var(--radius)", 
    marginBottom: "20px",
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
  }}>
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <h3 className="serif" style={{ fontSize: "20px", fontWeight: "400", color: "var(--foreground)" }}>{action}</h3>
        <span style={{ 
          fontSize: "10px", 
          fontWeight: "700", 
          textTransform: "uppercase", 
          padding: "4px 8px", 
          borderRadius: "4px",
          background: priority === "critical" ? "#fef2f2" : "#fff7ed",
          color: priority === "critical" ? "var(--danger)" : "var(--primary)"
        }}>
          {priority}
        </span>
      </div>
      
      <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: "1.6", marginBottom: "20px" }}>
        {rationale}
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {[time, zone, id].map(tag => (
          <span key={tag} style={{ 
            fontSize: "11px", 
            color: "var(--muted)", 
            padding: "4px 10px", 
            border: "1px solid var(--surface-border)", 
            borderRadius: "4px",
            background: "#fafafa"
          }}>
            {tag}
          </span>
        ))}
      </div>

      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginBottom: "6px" }}>
          <span>Confidence</span>
          <span style={{ fontWeight: "600" }}>{confidence}%</span>
        </div>
        <div style={{ height: "4px", background: "var(--surface-border)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${confidence}%`, background: "var(--primary)", opacity: 0.8 }} />
        </div>
      </div>
    </div>

    <div style={{ display: "flex", borderTop: "1px solid var(--surface-border)" }}>
      {["Accept", "Override", "Reject"].map((label, i) => (
        <button key={label} style={{ 
          flex: 1, 
          padding: "16px", 
          fontSize: "13px", 
          fontWeight: "500", 
          color: "var(--foreground)",
          borderRight: i < 2 ? "1px solid var(--surface-border)" : "none",
          transition: "background 0.2s ease"
        }}>
          {label}
        </button>
      ))}
    </div>
  </div>
);

const SidebarSection = ({ title, children }) => (
  <div style={{ marginBottom: "40px" }}>
    <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>
      {title}
    </h4>
    {children}
  </div>
);

export default function AgentPage() {
  const proposals = [
    {
      id: "P-001",
      action: "Curtail Unit G3 by 300 MW",
      time: "14:32",
      zone: "Central",
      confidence: 94,
      priority: "critical",
      rationale: "Over-generation detected. Solar forecast exceeds demand by 800 MW. Recommend curtailing thermal unit G3 to rebalance the grid."
    },
    {
      id: "P-002",
      action: "Activate demand response DR-7",
      time: "14:28",
      zone: "North",
      confidence: 87,
      priority: "high",
      rationale: "Industrial demand response contract available. Shedding 150 MW from flexible loads would improve reserve margin."
    }
  ];

  return (
    <div style={{ paddingBottom: "100px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "48px" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Agent decisions</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Review and act on AI-generated grid proposals</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "20px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }} />
            <span style={{ fontSize: "13px", fontWeight: "500" }}>Live</span>
          </div>
          <button style={{ 
            background: "var(--primary)", 
            color: "white", 
            padding: "10px 24px", 
            borderRadius: "8px", 
            fontSize: "14px", 
            fontWeight: "600" 
          }}>
            Simulate anomaly
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "20px", marginBottom: "48px" }}>
        <Card title="Generation" value="5,000 MW" subtext="+2.4% above target" accentColor="var(--primary)" />
        <Card title="Demand" value="4,200 MW" subtext="800 MW surplus" accentColor="var(--success)" />
        <Card title="Frequency" value="49.99 Hz" subtext="Target 50.00 Hz" accentColor="var(--surface-border)" />
        <Card title="Forecast accuracy" value="98.4%" subtext="Last 24 hours" accentColor="var(--primary)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "48px", alignItems: "start" }}>
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <h2 className="serif" style={{ fontSize: "24px", fontWeight: "400" }}>Action queue</h2>
            <span style={{ background: "#fef2f2", color: "var(--danger)", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px" }}>
              2 PENDING
            </span>
          </div>
          
          {proposals.map(p => (
            <ActionCard key={p.id} {...p} />
          ))}
        </section>

        <aside style={{ padding: "0 24px", borderLeft: "1px solid var(--surface-border)" }}>
          <SidebarSection title="Zone Status">
            {["North", "Central", "South"].map((zone, i) => (
              <div key={zone} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "500" }}>{zone}</div>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>{1200 + i * 400} MW</div>
                </div>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === 1 ? "var(--warning)" : "var(--success)" }} />
              </div>
            ))}
          </SidebarSection>

          <SidebarSection title="Performance">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {[
                { l: "Resolved", v: "12" },
                { l: "Accept rate", v: "94%" },
                { l: "Overrides", v: "3" },
                { l: "Avg latency", v: "1.2s" }
              ].map(stat => (
                <div key={stat.l} style={{ background: "#fcfcfb", border: "1px solid var(--surface-border)", padding: "16px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "400", marginBottom: "4px" }}>{stat.v}</div>
                  <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" }}>{stat.l}</div>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Agent Log">
            {[
              { t: "14:32", m: "Anomaly P-001 — curtailment required" },
              { t: "14:29", m: "Solar PV output +18% above forecast" },
              { t: "14:28", m: "Demand response P-002 flagged" }
            ].map((log, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", marginBottom: "16px", fontSize: "12px" }}>
                <span style={{ color: "var(--muted)", minWidth: "40px" }}>{log.t}</span>
                <span style={{ color: "var(--foreground)" }}>{log.m}</span>
              </div>
            ))}
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}

