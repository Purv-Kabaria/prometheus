import React, { useState, useEffect } from 'react';

export default function FeedbackModal({ proposal, mode, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [mwh, setMwh] = useState("");

  useEffect(() => {
    if (proposal) {
      setMwh(proposal.target_mwh);
      setReason("");
    }
  }, [proposal]);

  if (!proposal) return null;

  const handleSubmit = () => {
    onSubmit({
      proposal_id: proposal.id,
      status: mode === 'reject' ? 'rejected' : 'overridden',
      reason,
      overridden_mwh: mode === 'override' ? parseFloat(mwh) : null
    });
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100
    }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
        borderRadius: "var(--radius)",
        width: "100%",
        maxWidth: "480px",
        overflow: "hidden",
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)"
      }}>
        <div style={{ 
          padding: "24px 32px", 
          borderBottom: "1px solid var(--surface-border)",
          background: mode === 'reject' ? "rgba(192, 57, 43, 0.03)" : "rgba(230, 126, 34, 0.03)"
        }}>
          <h3 className="serif" style={{ 
            fontSize: "20px", 
            fontWeight: "400", 
            margin: 0,
            color: mode === 'reject' ? "var(--danger)" : "var(--primary)"
          }}>
            {mode === 'reject' ? 'Reject Agent Proposal' : 'Override Proposal Targets'}
          </h3>
          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Proposal {proposal.id}
          </p>
        </div>
        
        <div style={{ padding: "32px" }}>
          {mode === 'override' && (
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                New Target MWh
              </label>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input 
                  type="number" 
                  value={mwh}
                  onChange={(e) => setMwh(e.target.value)}
                  style={{ 
                    width: "100%", 
                    background: "var(--background)",
                    border: "1px solid var(--surface-border)", 
                    borderRadius: "8px 0 0 8px", 
                    padding: "12px 16px", 
                    color: "var(--foreground)",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
                <span style={{ 
                  background: "var(--accent)", 
                  border: "1px solid var(--surface-border)", 
                  borderLeft: "none",
                  borderRadius: "0 8px 8px 0", 
                  padding: "12px 16px", 
                  color: "var(--muted)", 
                  fontSize: "12px",
                  fontWeight: "600"
                }}>
                  MW
                </span>
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
              Officer Rationale
            </label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ 
                width: "100%", 
                background: "var(--background)",
                border: "1px solid var(--surface-border)", 
                borderRadius: "8px", 
                padding: "16px", 
                color: "var(--foreground)",
                fontSize: "14px",
                outline: "none",
                resize: "none",
                minHeight: "100px"
              }}
              placeholder="Provide context for the grid database..."
            ></textarea>
          </div>
        </div>
        
        <div style={{ 
          padding: "24px 32px", 
          background: "var(--accent)", 
          borderTop: "1px solid var(--surface-border)", 
          display: "flex", 
          justifyContent: "flex-end", 
          gap: "16px" 
        }}>
          <button 
            onClick={onClose} 
            style={{ fontSize: "13px", fontWeight: "600", color: "var(--muted)", padding: "8px 16px" }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            style={{ 
              background: mode === 'reject' ? "var(--danger)" : "var(--primary)", 
              color: "white", 
              padding: "10px 24px", 
              borderRadius: "8px", 
              fontSize: "13px", 
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            Submit to Database
          </button>
        </div>
      </div>
    </div>
  );
}
