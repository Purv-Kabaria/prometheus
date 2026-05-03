'use client';

import { useState, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

const STATUS_COLOR = {
  pending: { bg: '#1e293b', text: '#94a3b8', dot: '#64748b' },
  running: { bg: '#1c2f4a', text: '#60a5fa', dot: '#3b82f6' },
  done: { bg: '#0f2a1e', text: '#34d399', dot: '#10b981' },
  failed: { bg: '#2d1515', text: '#f87171', dot: '#ef4444' },
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
      setError('Only .csv files are accepted.');
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
    }, 1000);  // 1 s — snappy live log
  };

  // Extract completed STEP markers from log tail
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
      setError('Could not reach API: ' + err.message);
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────
  const statusTheme = jobStatus ? (STATUS_COLOR[jobStatus.status] || STATUS_COLOR.pending) : null;
  const fmt = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 64 }}>

      {/* ── header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
          📡 Data Ingestion &amp; Retrain
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Upload a CSV, validate continuity, and trigger incremental model retraining.
        </p>
      </div>

      {/* ── drop zone ── */}
      <div
        id="drop-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--surface-border)'}`,
          borderRadius: 16,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--accent)' : 'var(--surface)',
          transition: 'all 0.2s ease',
          marginBottom: 20,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && pickFile(e.target.files[0])}
        />
        <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
        {file ? (
          <div>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{file.name}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              {(file.size / 1024).toFixed(1)} KB · Click to change
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontWeight: 500, fontSize: 15 }}>Drop CSV here or click to browse</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              Required columns: Start time UTC · End time UTC · Electricity consumption (MWh)
            </p>
          </div>
        )}
      </div>

      {/* ── required format hint ── */}
      <div style={{
        background: 'var(--accent)',
        border: '1px solid var(--surface-border)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20,
        fontSize: 12,
        color: 'var(--muted)',
        fontFamily: 'monospace',
      }}>
        <strong style={{ color: 'var(--foreground)' }}>Expected format (hourly, UTC):</strong>
        <br />
        Start time UTC, End time UTC, Electricity consumption (MWh)<br />
        2024-01-10 00:00:00+00:00, 2024-01-10 01:00:00+00:00, 4312.7<br />
        2024-01-10 01:00:00+00:00, 2024-01-10 02:00:00+00:00, 4189.3
      </div>

      {/* ── action buttons ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          id="upload-btn"
          onClick={upload}
          disabled={!file || uploading}
          style={{
            flex: 1,
            padding: '13px 0',
            borderRadius: 10,
            background: !file || uploading ? 'var(--surface-border)' : 'var(--primary)',
            color: !file || uploading ? 'var(--muted)' : '#fff',
            fontWeight: 600,
            fontSize: 15,
            transition: 'all 0.2s',
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? '⏳ Uploading…' : '🚀 Upload & Retrain'}
        </button>

        <button
          id="registry-btn"
          onClick={fetchRegistry}
          style={{
            padding: '13px 20px',
            borderRadius: 10,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface)',
            color: 'var(--foreground)',
            fontWeight: 500,
            fontSize: 14,
            transition: 'background 0.2s',
          }}
        >
          🗂 Registry
        </button>
      </div>

      {/* ── error ── */}
      {error && (
        <div style={{
          background: '#2d1515', border: '1px solid #7f1d1d',
          borderRadius: 10, padding: '14px 16px', marginBottom: 20,
          color: '#fca5a5', fontSize: 14,
        }}>
          ❌ {error}
        </div>
      )}

      {/* ── upload result card ── */}
      {result && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--surface-border)',
          borderRadius: 14, padding: 20, marginBottom: 20,
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>✅ Upload Accepted</h3>
          <Row label="File" value={result.filename} />
          <Row label="Rows merged" value={result.rows_merged} />
          <Row label="New version" value={result.new_version} mono />
          <Row label="Job ID" value={result.job_id} mono small />
          <Row label="Status" value={result.status} />

          {result.anomalies_detected > 0 && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 10,
              background: '#2d1515', border: '1px solid #7f1d1d',
              color: '#fca5a5', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span>⚠️ <strong>{result.anomalies_detected} anomalies</strong> detected in uploaded data.</span>
              <a href="/anomaly" style={{
                background: '#fca5a5', color: '#450a0a', padding: '4px 10px',
                borderRadius: 6, fontWeight: 600, fontSize: 12, textDecoration: 'none'
              }}>View Anomalies</a>
            </div>
          )}
        </div>
      )}

      {/* ── live job status ── */}
      {jobStatus && statusTheme && (
        <div style={{
          background: statusTheme.bg,
          border: `1px solid ${statusTheme.dot}44`,
          borderRadius: 14, padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: statusTheme.dot,
              boxShadow: `0 0 8px ${statusTheme.dot}`,
              display: 'inline-block',
              animation: polling ? 'pulse 1.5s infinite' : 'none',
            }} />
            <h3 style={{ fontWeight: 600, color: statusTheme.text, fontSize: 15 }}>
              Training Job · {jobStatus.status.toUpperCase()}
              {polling && ' (live)'}
            </h3>
          </div>

          <Row label="Version" value={jobStatus.version} mono />
          <Row label="Parent" value={jobStatus.parent} mono />
          <Row label="Started" value={fmt(jobStatus.started_at)} />
          {jobStatus.finished_at && <Row label="Finished" value={fmt(jobStatus.finished_at)} />}
          {jobStatus.pid && <Row label="PID" value={jobStatus.pid} mono />}

          {/* step progress pills */}
          {jobStatus.log_tail && (() => {
            const steps = parseSteps(jobStatus.log_tail);
            const doneCount = steps.filter(s => s.done).length;
            return (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  PROGRESS — {doneCount}/{steps.length} steps
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {steps.map(s => (
                    <span key={s.key} style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: s.done ? '#0f2a1e' : 'var(--accent)',
                      color: s.done ? '#34d399' : 'var(--muted)',
                      border: `1px solid ${s.done ? '#10b981' : 'var(--surface-border)'}`,
                      transition: 'all 0.3s',
                    }}>
                      {s.done ? '✓' : '○'} {s.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* log tail */}
          {jobStatus.log_tail && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                LIVE LOG (last 30 lines)
              </p>
              <pre style={{
                background: '#0a0a0a', borderRadius: 8, padding: '12px 14px',
                fontSize: 11, color: '#a3e635', overflowX: 'auto',
                maxHeight: 300, overflowY: 'auto', lineHeight: 1.7,
                fontFamily: 'monospace',
              }}>
                {jobStatus.log_tail}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── registry panel ── */}
      {registry && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--surface-border)',
          borderRadius: 14, padding: 20,
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>
            🗂 Model Registry
          </h3>
          <div style={{
            display: 'inline-block', background: 'var(--primary)', color: '#fff',
            borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600,
            marginBottom: 16, fontFamily: 'monospace',
          }}>
            Active: {registry.active_version}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(registry.versions).map(([ver, meta]) => (
              <div key={ver} style={{
                background: 'var(--accent)',
                border: registry.active_version === ver
                  ? '1px solid var(--primary)' : '1px solid var(--surface-border)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>{ver}</span>
                  {registry.active_version === ver && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, background: 'var(--primary)',
                      color: '#fff', borderRadius: 4, padding: '2px 6px',
                    }}>ACTIVE</span>
                  )}
                  {meta.parent && (
                    <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>
                      ← {meta.parent}
                    </span>
                  )}
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                    {fmt(meta.created_at)} · MAPE: {meta.mape || '—'}
                  </p>
                </div>
                {meta.note && (
                  <span style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
                    {meta.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── tiny helper ───────────────────────────────────────────────────────────────
function Row({ label, value, mono = false, small = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: small ? 12 : 14,
        maxWidth: '60%', wordBreak: 'break-all', textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}
