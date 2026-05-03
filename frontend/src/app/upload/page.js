'use client';

import { useState, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

const STATUS_THEME = {
  pending:  { bg: 'var(--accent)', text: 'var(--muted)', dot: 'var(--muted)' },
  running:  { bg: 'rgba(59, 130, 246, 0.05)', text: 'var(--primary)', dot: 'var(--primary)' },
  done:     { bg: 'rgba(34, 197, 94, 0.05)', text: 'var(--success)', dot: 'var(--success)' },
  failed:   { bg: 'rgba(239, 68, 68, 0.05)', text: 'var(--danger)', dot: 'var(--danger)' },
};

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);   // upload response
  const [jobStatus, setJobStatus] = useState(null);   // polled status
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);
  const [registry, setRegistry] = useState(null);
  const fileRef = useRef();
  const pollRef = useRef(null);

  // ── drag & drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const pickFile = (f) => {
    if (!f.name.endsWith('.csv')) {
      setError('Invalid format. Please upload a CSV file.');
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    setJobStatus(null);
    setRegistry(null);
  };

  // ── upload ────────────────────────────────────────────────────────────────
  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setJobStatus(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/pipeline/upload`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setResult(data);
      startPolling(data.job_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── polling ───────────────────────────────────────────────────────────────
  const startPolling = (jobId) => {
    setPolling(true);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/pipeline/status/${jobId}`);
        const data = await res.json();
        setJobStatus(data);
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(pollRef.current);
          setPolling(false);
        }
      } catch { /* network blip — keep polling */ }
    }, 1000);
  };

  const parseSteps = (log = '') => {
    const steps = [
      { key: 'STEP 1', label: 'Load artefacts' },
      { key: 'STEP 2', label: 'Build features' },
      { key: 'STEP 3', label: 'Scale & sequence' },
      { key: 'STEP 4', label: 'Fine-tune TCN' },
      { key: 'STEP 5', label: 'XGB corrector' },
      { key: 'STEP 6', label: 'Save artefacts' },
      { key: 'STEP 7', label: 'Update registry' },
    ];
    return steps.map(s => ({ ...s, done: log.includes(s.key) }));
  };

  // ── registry ──────────────────────────────────────────────────────────────
  const fetchRegistry = async () => {
    try {
      const res = await fetch(`${API_BASE}/pipeline/registry`);
      const data = await res.json();
      setRegistry(data);
    } catch (err) {
      setError('System registry unreachable.');
    }
  };

  const theme = jobStatus ? (STATUS_THEME[jobStatus.status] || STATUS_THEME.pending) : null;
  const fmt = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ marginBottom: "48px" }}>
        <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Data ingestion</h1>
        <p style={{ color: "var(--muted)", fontSize: "15px" }}>Upload operational telemetry for incremental model retraining</p>
      </div>

      {/* Drop Zone */}
      <div
        id="drop-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
        style={{
          border: `1px dashed ${dragging ? 'var(--primary)' : 'var(--surface-border)'}`,
          borderRadius: "var(--radius)",
          padding: '60px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--accent)' : 'var(--surface)',
          transition: 'all 0.2s ease',
          marginBottom: 24,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && pickFile(e.target.files[0])}
        />
        {file ? (
          <div>
            <p className="serif" style={{ fontSize: "20px", marginBottom: "4px" }}>{file.name}</p>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              {(file.size / 1024).toFixed(1)} KB · Ready for ingestion
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontWeight: "500", fontSize: "15px", marginBottom: "8px" }}>Select a CSV file to begin</p>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              Drag and drop or click to browse
            </p>
          </div>
        )}
      </div>

      {/* Format Hint */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--surface-border)',
        borderRadius: "var(--radius)",
        padding: '20px',
        marginBottom: 32,
        fontSize: '12px',
        color: 'var(--muted)',
      }}>
        <p style={{ fontWeight: "700", color: "var(--foreground)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Expected schema</p>
        <code style={{ display: "block", background: "var(--accent)", padding: "12px", borderRadius: "4px", lineHeight: "1.6" }}>
          timestamp, value_mwh<br />
          2024-01-10T00:00:00Z, 4312.7<br />
          2024-01-10T01:00:00Z, 4189.3
        </code>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 48 }}>
        <button
          onClick={upload}
          disabled={!file || uploading}
          style={{
            flex: 1,
            padding: '12px 0',
            borderRadius: 8,
            background: !file || uploading ? 'var(--accent)' : 'var(--primary)',
            color: !file || uploading ? 'var(--muted)' : '#fff',
            fontWeight: "600",
            fontSize: "14px",
            transition: 'all 0.2s',
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
            border: "none"
          }}
        >
          {uploading ? 'Processing...' : 'Start retraining job'}
        </button>

        <button
          onClick={fetchRegistry}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface)',
            color: 'var(--foreground)',
            fontWeight: "500",
            fontSize: "14px",
            transition: 'background 0.2s',
            cursor: "pointer"
          }}
        >
          View registry
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.05)', border: '1px solid var(--danger)',
          borderRadius: "var(--radius)", padding: '16px', marginBottom: 24,
          color: 'var(--danger)', fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* Results & Status */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {result && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--surface-border)',
            borderRadius: "var(--radius)", padding: "24px",
          }}>
            <h3 className="serif" style={{ fontSize: "18px", marginBottom: "20px" }}>Ingestion accepted</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Row label="Filename" value={result.filename} />
              <Row label="Rows merged" value={result.rows_merged} />
              <Row label="Model version" value={result.new_version} mono />
              <Row label="Job identification" value={result.job_id} mono small />
            </div>
            
            {result.anomalies_detected > 0 && (
              <div style={{
                marginTop: "24px", padding: '16px', borderRadius: "8px",
                background: 'rgba(239, 68, 68, 0.05)', border: '1px solid var(--danger)',
                color: 'var(--danger)', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>⚠️ <strong>{result.anomalies_detected} anomalies</strong> detected in uploaded data.</span>
                <a href="/anomaly" style={{
                  background: 'var(--danger)', color: 'white', padding: '4px 12px',
                  borderRadius: 6, fontWeight: 600, fontSize: 12, textDecoration: 'none'
                }}>Review</a>
              </div>
            )}
          </div>
        )}

        {jobStatus && theme && (
          <div style={{
            background: 'var(--surface)',
            border: `1px solid var(--surface-border)`,
            borderRadius: "var(--radius)", padding: "24px",
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: theme.dot,
                  animation: polling ? 'pulse 2s infinite' : 'none',
                }} />
                <h3 className="serif" style={{ fontSize: "18px" }}>Retraining pipeline</h3>
              </div>
              <span style={{ 
                background: "var(--accent)", color: theme.text, padding: "2px 10px", 
                borderRadius: "4px", fontSize: "10px", fontWeight: "700", textTransform: "uppercase" 
              }}>
                {jobStatus.status}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              <Row label="Started at" value={fmt(jobStatus.started_at)} />
              {jobStatus.finished_at && <Row label="Finished at" value={fmt(jobStatus.finished_at)} />}
              <Row label="System PID" value={jobStatus.pid || "—"} mono />
            </div>

            {/* Pipeline progress bar */}
            {jobStatus.log_tail && (() => {
              const steps = parseSteps(jobStatus.log_tail);
              const doneCount = steps.filter(s => s.done).length;
              return (
                <div style={{ marginTop: "32px" }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>Pipeline progress</span>
                    <span>{doneCount} / {steps.length} steps</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--accent)', borderRadius: '2px', overflow: 'hidden', marginBottom: '24px' }}>
                    <div style={{ height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: 'var(--primary)', transition: 'width 0.5s ease' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {steps.map(s => (
                      <div key={s.key} style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: "8px 0", borderBottom: "1px solid var(--accent)",
                        opacity: s.done ? 1 : 0.4
                      }}>
                        <span style={{ color: s.done ? "var(--success)" : "var(--muted)", fontWeight: "700", fontSize: "12px" }}>
                          {s.done ? "✓" : "○"}
                        </span>
                        <span style={{ fontSize: "13px" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Log Tail */}
                  <div style={{ marginTop: "32px" }}>
                    <p style={{ fontSize: "11px", color: 'var(--muted)', marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "700" }}>Live execution log</p>
                    <pre style={{
                      background: 'var(--background)', borderRadius: '8px', padding: '16px',
                      fontSize: '11px', color: 'var(--primary)', overflowX: 'auto',
                      maxHeight: '200px', overflowY: 'auto', lineHeight: '1.6',
                      fontFamily: 'monospace', border: '1px solid var(--surface-border)'
                    }}>
                      {jobStatus.log_tail}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Registry */}
        {registry && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--surface-border)',
            borderRadius: "var(--radius)", padding: "24px",
          }}>
            <h3 className="serif" style={{ fontSize: "20px", marginBottom: "24px" }}>Model registry</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(registry.versions).map(([ver, meta]) => (
                <div key={ver} style={{
                  padding: '16px',
                  borderRadius: 8,
                  background: 'var(--accent)',
                  border: registry.active_version === ver ? '1px solid var(--primary)' : '1px solid transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontWeight: "700", fontSize: "14px", fontFamily: "monospace" }}>{ver}</span>
                    <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
                      {fmt(meta.created_at)} · MAPE: {meta.mape || '—'}
                    </p>
                  </div>
                  {registry.active_version === ver && (
                    <span style={{ background: "var(--primary)", color: "#fff", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "4px" }}>ACTIVE</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, mono = false, small = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: small ? '11px' : '13px',
        fontWeight: "500"
      }}>
        {value}
      </span>
    </div>
  );
}
