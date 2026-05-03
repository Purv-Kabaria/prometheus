"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(saved);
  }, []);

  useEffect(() => {
    const body = document.body;
    if (theme === "dark") {
      body.classList.add('dark');
      body.classList.remove('light');
    } else {
      body.classList.add('light');
      body.classList.remove('dark');
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  const links = [
    { name: "Overview", href: "/" },
    { name: "Forecasting", href: "/forecasting" },
    { name: "Forecasting Visualizations", href: "/forecasting-visuals" },
    { name: "Reporting", href: "/reporting" },
    { name: "Anomaly & Explain", href: "/anomaly" },
    { name: "Agent Decisions", href: "/agent" },
    { name: "Insights & Cost", href: "/insights" },
    { name: "Upload & Retrain", href: "/upload" },
  ];

  return (
    <div style={{
      width: "280px",
      flexShrink: 0,
      borderRight: "1px solid var(--surface-border)",
      background: "var(--surface)",
      padding: "32px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "40px",
      height: "100vh",
      position: "sticky",
      top: 0,
      zIndex: 20,
      overflow: "hidden"
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <div style={{ width: "24px", height: "24px", background: "var(--primary)", borderRadius: "4px" }}></div>
          <h2 className="serif" style={{ fontSize: "22px", fontWeight: "400", color: "var(--foreground)", letterSpacing: "-0.02em" }}>Prometheus</h2>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "10px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em", paddingLeft: "36px" }}>Grid Dashboard</p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <p style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", paddingLeft: "12px" }}>Menu</p>
        {links.map(link => {
          const isActive = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: isActive ? "600" : "400",
              color: isActive ? "var(--foreground)" : "var(--muted)",
              background: isActive ? "var(--accent)" : "transparent",
              transition: "all 0.2s ease",
            }}>
              {isActive && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--primary)" }}></div>}
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ padding: "0 12px" }}>
          <button 
            onClick={toggleTheme}
            style={{ 
              width: "100%", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              fontSize: "12px", 
              color: "var(--muted)",
              padding: "8px 0"
            }}
          >
            Appearance
            <span style={{ 
              background: "var(--accent)", 
              padding: "4px 10px", 
              borderRadius: "12px", 
              fontSize: "10px", 
              fontWeight: "700",
              color: "var(--foreground)"
            }}>
              {theme === "dark" ? "DARK" : "LIGHT"}
            </span>
          </button>
        </div>

        <div style={{ padding: "24px", borderTop: "1px solid var(--surface-border)" }}>
          <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "16px" }}>System status: <span style={{ color: "var(--success)", fontWeight: "600" }}>Nominal</span></p>
          <button 
            onClick={() => window.location.href = '/reporting'}
            style={{ width: "100%", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "12px", fontSize: "13px", fontWeight: "600", color: "var(--foreground)" }}
          >
            View daily logs
          </button>
        </div>
      </div>
    </div>
  );
}
