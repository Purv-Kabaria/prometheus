"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Overview", href: "/" },
    { name: "Forecasting", href: "/forecasting" },
    { name: "Anomaly & Explain", href: "/anomaly" },
    { name: "Agent Decisions", href: "/agent" },
    { name: "Reporting", href: "/reporting" },
    { name: "Insights & Cost", href: "/insights" },
  ];

  return (
    <div style={{
      width: "260px",
      borderRight: "1px solid var(--surface-border)",
      background: "var(--surface)",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      minHeight: "100vh"
    }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--foreground)", letterSpacing: "-0.02em" }}>Prometheus</h2>
        <p style={{ color: "var(--muted)", fontSize: "12px", marginTop: "4px" }}>Grid Officer Platform</p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {links.map(link => {
          const isActive = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding: "10px 16px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: isActive ? "600" : "500",
              color: isActive ? "var(--primary)" : "var(--muted)",
              background: isActive ? "var(--accent)" : "transparent",
              transition: "all 0.2s ease"
            }}>
              {link.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
