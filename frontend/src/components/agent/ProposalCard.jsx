import React from 'react';

export default function ProposalCard({ proposal, onAccept, onReject, onOverride }) {
  if (!proposal) return null;
  
  const isMaintenance = proposal.action_type === 'maintenance';
  const isPending = proposal.status === 'pending_approval';

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--surface-border)",
      borderRadius: "var(--radius)",
      padding: "24px",
      marginBottom: "20px",
      transition: "all 0.2s ease"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {proposal.status && !isPending && (
            <span style={{
              fontSize: "10px", fontWeight: "700", padding: "3px 10px",
              borderRadius: "20px", textTransform: "uppercase",
              background: proposal.status === 'accepted' ? "rgba(39,174,96,0.12)" : "rgba(192,57,43,0.1)",
              color: proposal.status === 'accepted' ? "var(--success)" : "var(--danger)"
            }}>
              {proposal.status}
            </span>
          )}
          <div style={{ 
            width: "40px", 
            height: "40px", 
            borderRadius: "8px", 
            background: "var(--accent)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            color: "var(--primary)",
            fontWeight: "700" 
          }}>
            {isMaintenance ? 'M' : 'A'}
          </div>
          <div>
            <h3 className="serif" style={{ fontSize: "16px", fontWeight: "400", margin: 0 }}>
              {isMaintenance ? 'Maintenance Schedule' : `Agent Proposal: ${proposal.action_type.toUpperCase()}`}
            </h3>
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "500" }}>
              ID: {proposal.id} {isMaintenance && `· Unit: ${proposal.equipment_id}`}
            </span>
          </div>
        </div>
        <span style={{ 
          fontSize: "10px", 
          fontWeight: "700", 
          padding: "4px 12px", 
          background: "var(--accent)", 
          color: "var(--success)", 
          borderRadius: "20px",
          border: "1px solid var(--surface-border)"
        }}>
          {proposal.confidence != null ? `${proposal.confidence}% Confidence` : 'High Confidence'}
        </span>
      </div>
      
      <div style={{ 
        background: "var(--accent)", 
        padding: "16px", 
        borderRadius: "8px", 
        marginBottom: "24px",
        border: "1px solid var(--surface-border)"
      }}>
        <p style={{ fontSize: "14px", color: "var(--foreground)", lineHeight: "1.6", margin: 0 }}>
          <strong style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Rationale:</strong><br />
          {proposal.rationale || "No detailed rationale provided by agent."}
        </p>
      </div>
      
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "20px", borderTop: "1px solid var(--surface-border)" }}>
        <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--primary)", background: "var(--accent)", padding: "8px 16px", borderRadius: "6px" }}>
          {isMaintenance ? (
            <span>Window: {proposal.start_time} – {proposal.end_time}</span>
          ) : (
            <span>Target: {proposal.target_mwh} MWh @ {proposal.target_hour}</span>
          )}
        </div>
        
        {isPending && (
          <div style={{ display: "flex", gap: "12px", marginLeft: "auto" }}>
            <button 
              onClick={() => onReject(proposal)}
              style={{ fontSize: "13px", fontWeight: "600", color: "var(--danger)", padding: "8px 16px" }}
            >
              Reject
            </button>
            <button 
              onClick={() => onOverride(proposal)}
              style={{ fontSize: "13px", fontWeight: "600", color: "var(--muted)", padding: "8px 16px" }}
            >
              Override
            </button>
            <button 
              onClick={() => onAccept(proposal)}
              style={{ background: "var(--primary)", color: "white", padding: "8px 24px", borderRadius: "8px", fontSize: "13px", fontWeight: "600" }}
            >
              Accept Proposal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
