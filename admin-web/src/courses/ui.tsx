import React, { useEffect, useState } from 'react';
import { resolveImageUrl } from '../api';

// ---------------------------------------------------------------------------
// Shared styles (theme variables come from App.tsx so dark mode works)
// ---------------------------------------------------------------------------
export const card: React.CSSProperties = {
  background: 'var(--bg-card, #ffffff)',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid var(--border-color, #e2e8f0)',
};
export const muted: React.CSSProperties = { color: 'var(--text-secondary, #64748b)', fontSize: '13px' };
export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary, #334155)',
  marginBottom: '6px',
};
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color, #cbd5e1)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #0f172a)',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
export const errorText: React.CSSProperties = { margin: '4px 0 0', fontSize: '12px', color: '#dc2626' };

export const btn = (kind: 'primary' | 'secondary' | 'danger' | 'ghost', disabled = false): React.CSSProperties => ({
  padding: kind === 'ghost' ? '4px 8px' : '9px 16px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: kind === 'ghost' ? '13px' : '14px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  whiteSpace: 'nowrap',
  border:
    kind === 'secondary' ? '1px solid var(--border-color, #cbd5e1)' : kind === 'danger' ? '1px solid #fecaca' : 'none',
  background:
    kind === 'primary' ? '#16a34a' : kind === 'danger' ? '#fef2f2' : kind === 'ghost' ? 'transparent' : 'var(--bg-card, #ffffff)',
  color:
    kind === 'primary' ? '#ffffff' : kind === 'danger' ? '#dc2626' : kind === 'ghost' ? 'var(--text-secondary, #475569)' : 'var(--text-primary, #0f172a)',
});

export const Alert: React.FC<{ kind: 'error' | 'success' | 'info'; children: React.ReactNode }> = ({ kind, children }) => {
  const colors = {
    error: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
    info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.fg, padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal shell + confirmation dialog
// ---------------------------------------------------------------------------
export const Modal: React.FC<{ title: string; onClose: () => void; busy?: boolean; width?: number; children: React.ReactNode }> = ({
  title,
  onClose,
  busy,
  width = 520,
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 900 }}
    >
      <div style={{ ...card, width: '100%', maxWidth: `${width}px`, maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary, #0f172a)' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ title, message, confirmLabel, busy, error, onCancel, onConfirm }) => (
  <Modal title={title} onClose={onCancel} busy={busy} width={460}>
    <div style={{ ...muted, fontSize: '14px' }}>{message}</div>
    {error && <p style={errorText}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
      <button type="button" onClick={onCancel} disabled={busy} style={btn('secondary', busy)} autoFocus>
        Cancel
      </button>
      <button type="button" onClick={onConfirm} disabled={busy} style={btn('danger', busy)}>
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  </Modal>
);

// ---------------------------------------------------------------------------
// Course cover picture: tries the storage link, then the stored address,
// then shows a neutral placeholder.
// ---------------------------------------------------------------------------
export const CoverImage: React.FC<{ storedUrl?: string | null; localPreview?: string | null; alt: string; style: React.CSSProperties }> = ({
  storedUrl,
  localPreview,
  alt,
  style,
}) => {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIndex(0);
    if (localPreview) {
      setCandidates([localPreview]);
      return;
    }
    if (!storedUrl) {
      setCandidates([]);
      return;
    }
    setResolving(true);
    resolveImageUrl(storedUrl, 'course').then((resolved) => {
      if (cancelled) return;
      const list = [resolved, /^https?:\/\//i.test(storedUrl) ? storedUrl : null].filter(Boolean) as string[];
      setCandidates(Array.from(new Set(list)));
      setResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storedUrl, localPreview]);

  const src = candidates[index];
  if (!src) {
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--table-header-bg, #f1f5f9)',
          color: 'var(--text-secondary, #64748b)',
          fontSize: '12px',
        }}
        aria-label={resolving ? 'Loading picture' : 'No cover picture'}
      >
        {resolving ? '' : storedUrl ? 'Picture unavailable' : 'No cover'}
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setIndex((i) => i + 1)} style={{ ...style, objectFit: 'cover' }} />;
};

// ---------------------------------------------------------------------------
// Warn before closing the browser tab with unsaved work
// ---------------------------------------------------------------------------
export const useUnsavedWarning = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
};

export const formatDate = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
};