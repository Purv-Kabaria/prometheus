export default function Card({ title, value, subtext, accentColor, children }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--surface-border)",
      borderRadius: "var(--radius)",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
      position: "relative",
      overflow: "hidden"
    }}>
      <span style={{ color: "var(--muted)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</span>
      {value && (
        <div className="serif" style={{ fontSize: "28px", fontWeight: "400", color: "var(--foreground)", letterSpacing: "-0.02em", marginTop: "4px" }}>
          {value}
        </div>
      )}
      {subtext && (
        <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "500" }}>
          {subtext}
        </div>
      )}
      {children && <div style={{ marginTop: "12px" }}>{children}</div>}
      
      {accentColor && (
        <div style={{ 
          position: "absolute", 
          bottom: 0, 
          left: 0, 
          right: 0, 
          height: "3px", 
          background: accentColor,
          opacity: 0.8
        }} />
      )}
    </div>
  );
}

