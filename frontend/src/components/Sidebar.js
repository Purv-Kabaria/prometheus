"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Overview", href: "/", icon: "🏠" },
    { name: "Forecasting", href: "/forecasting", icon: "📈" },
    { name: "Reporting", href: "/reporting", icon: "📋" },
    { name: "Anomaly & Explain", href: "/anomaly", icon: "🔍" },
    { name: "Agent Decisions", href: "/agent", icon: "🤖" },
    { name: "Insights & Cost", href: "/insights", icon: "💰" },
    { name: "Upload & Retrain", href: "/upload", icon: "📤" },
  ];

  return (
    <div style={{
      width: "260px",
      borderRight: "1px solid var(--surface-border)",
      background: "var(--surface)",
      padding: "28px 20px",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
      minHeight: "100vh",
      position: "sticky",
      top: 0
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div style={{ width: "32px", height: "32px", background: "var(--primary)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>P</div>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--foreground)", letterSpacing: "-0.03em" }}>Prometheus</h2>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", paddingLeft: "42px" }}>Grid Intelligence</p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <p style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px", paddingLeft: "12px" }}>Navigation</p>
        {links.map(link => {
          const isActive = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "10px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: isActive ? "700" : "500",
              color: isActive ? "var(--primary)" : "var(--muted)",
              background: isActive ? "var(--accent)" : "transparent",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              border: isActive ? "1px solid rgba(99,102,241,0.1)" : "1px solid transparent"
            }}>
              <span style={{ fontSize: "18px", opacity: isActive ? 1 : 0.7 }}>{link.icon}</span>
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", padding: "20px", background: "var(--accent)", borderRadius: "12px" }}>
        <p style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Quick Actions</p>
        <button 
          onClick={() => window.location.href = '/reporting'}
          style={{ width: "100%", background: "var(--primary)", color: "white", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          📄 Daily Report
        </button>
      </div>
    </div>
  );
}
