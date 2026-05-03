export default function Card({ title, value, subtext, type = "default", children }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--surface-border)",
      borderRadius: "var(--radius)",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
    }}>
      <span style={{ color: "var(--muted)", fontSize: "12px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
      {value && <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--foreground)" }}>{value}</div>}
      {subtext && <span style={{ fontSize: "12px", color: type === "success" ? "var(--success)" : type === "danger" ? "var(--danger)" : type === "warning" ? "var(--warning)" : "var(--muted)" }}>{subtext}</span>}
      {children && <div style={{ marginTop: "12px" }}>{children}</div>}
    </div>
  );
}
