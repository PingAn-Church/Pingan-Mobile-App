import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Announcement,
  createAnnouncement,
  deleteAnnouncement,
  deleteOwnUpload,
  getAllAnnouncements,
  getErrorMessage,
  resolveImageUrl,
  updateAnnouncement,
  uploadImage,
  UploadCancelledError,
} from './api';

// Same rules the server enforces (AnnouncementService.validate), checked here
// first so volunteers get instant, plain-language feedback.
const TITLE_MAX = 70;
const SERVER_LIMIT = 20;

const isValidHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
};

const formatDate = (value: Announcement['createdAt']) => {
  if (value === null || value === undefined || value === '') return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// Shared styles (use the theme variables from App.tsx so dark mode works)
// ---------------------------------------------------------------------------
const card: React.CSSProperties = {
  background: 'var(--bg-card, #ffffff)',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid var(--border-color, #e2e8f0)',
};
const label: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary, #334155)',
  marginBottom: '6px',
};
const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color, #cbd5e1)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #0f172a)',
  fontSize: '14px',
  boxSizing: 'border-box',
};
const hint: React.CSSProperties = { margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748b)' };
const fieldError: React.CSSProperties = { margin: '4px 0 0', fontSize: '12px', color: '#dc2626' };
const button = (kind: 'primary' | 'secondary' | 'danger', disabled = false): React.CSSProperties => ({
  padding: '10px 18px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  border: kind === 'secondary' ? '1px solid var(--border-color, #cbd5e1)' : kind === 'danger' ? '1px solid #fecaca' : 'none',
  background: kind === 'primary' ? '#16a34a' : kind === 'danger' ? '#fef2f2' : 'var(--bg-card, #ffffff)',
  color: kind === 'primary' ? '#ffffff' : kind === 'danger' ? '#dc2626' : 'var(--text-primary, #0f172a)',
});

// ---------------------------------------------------------------------------
// Picture that resolves its own display URL and degrades gracefully
// ---------------------------------------------------------------------------
const AnnouncementImage: React.FC<{ storedUrl?: string; localPreview?: string | null; alt: string; style: React.CSSProperties }> = ({
  storedUrl,
  localPreview,
  alt,
  style,
}) => {
  const [src, setSrc] = useState<string | null>(localPreview ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (localPreview) {
      setSrc(localPreview);
      return;
    }
    setSrc(null);
    if (!storedUrl) return;
    resolveImageUrl(storedUrl, 'announcement').then((url) => {
      if (cancelled) return;
      if (url) setSrc(url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storedUrl, localPreview]);

  if (failed || (!src && !storedUrl)) {
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
          textAlign: 'center',
        }}
      >
        {storedUrl ? 'Picture unavailable' : 'No picture'}
      </div>
    );
  }
  if (!src) {
    return <div style={{ ...style, background: 'var(--table-header-bg, #f1f5f9)' }} aria-label="Loading picture" />;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} style={{ ...style, objectFit: 'cover' }} />;
};

// ---------------------------------------------------------------------------
// Delete confirmation: names exactly what will happen
// ---------------------------------------------------------------------------
const ConfirmDelete: React.FC<{
  item: Announcement;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ item, busy, error, onCancel, onConfirm }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 900 }}
    >
      <div style={{ ...card, maxWidth: '440px', width: '100%' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary, #0f172a)' }}>Delete this announcement?</h3>
        <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '14px' }}>
          <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{item.title}”</strong> will be removed from every member’s app
          straight away, and its picture will be deleted. This cannot be undone.
        </p>
        {error && <p style={fieldError}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={onCancel} disabled={busy} style={button('secondary', busy)} autoFocus>
            Keep it
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} style={button('danger', busy)}>
            {busy ? 'Deleting…' : 'Delete announcement'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------
interface FormProps {
  editing: Announcement | null;
  onSaved: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const AnnouncementForm: React.FC<FormProps> = ({ editing, onSaved, onCancelEdit, onDirtyChange }) => {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [link, setLink] = useState(editing?.announcementLink ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset when switching between "new" and "edit".
  useEffect(() => {
    setTitle(editing?.title ?? '');
    setLink(editing?.announcementLink ?? '');
    setFile(null);
    setTouched(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editing]);

  // Local preview of the chosen picture.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dirty = editing
    ? title !== editing.title || link !== (editing.announcementLink ?? '') || file !== null
    : title.trim() !== '' || link.trim() !== '' || file !== null;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const titleTrim = title.trim();
  const linkTrim = link.trim();
  const errors = {
    title: !titleTrim ? 'Please enter a title.' : titleTrim.length > TITLE_MAX ? `Title must be ${TITLE_MAX} characters or fewer.` : null,
    image: !editing && !file ? 'Please choose a picture.' : null,
    link: linkTrim && !isValidHttpUrl(linkTrim) ? 'The link must start with http:// or https://' : null,
  };
  const hasErrors = Boolean(errors.title || errors.image || errors.link);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    if (chosen && !chosen.type.startsWith('image/')) {
      setError('Please choose a picture file (JPG or PNG).');
      e.target.value = '';
      return;
    }
    setError(null);
    setFile(chosen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || hasErrors) return; // double-click guard + validation
    setSaving(true);
    setError(null);

    let uploadedUrl: string | null = null;
    try {
      let imageUrl = editing?.imageUrl ?? '';
      if (file) {
        abortRef.current = new AbortController();
        setProgress(0);
        uploadedUrl = await uploadImage(file, 'announcement', {
          onProgress: setProgress,
          signal: abortRef.current.signal,
        });
        imageUrl = uploadedUrl;
      }
      setProgress(null);

      // The record is only created AFTER the picture is safely in storage.
      if (editing) await updateAnnouncement(editing.id, titleTrim, imageUrl, linkTrim);
      else await createAnnouncement(titleTrim, imageUrl, linkTrim);

      uploadedUrl = null; // now referenced; must not be cleaned up
      onDirtyChange(false);
      setTitle('');
      setLink('');
      setFile(null);
      setTouched(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSaved();
    } catch (err) {
      setError(err instanceof UploadCancelledError ? 'Upload cancelled. Nothing was published.' : getErrorMessage(err));
    } finally {
      // If the picture uploaded but saving the record failed, remove the orphan.
      if (uploadedUrl) void deleteOwnUpload(uploadedUrl, 'announcement');
      abortRef.current = null;
      setProgress(null);
      setSaving(false);
    }
  };

  const show = (msg: string | null) => (touched && msg ? <p style={fieldError}>{msg}</p> : null);

  return (
    <div style={{ ...card, marginBottom: '32px' }}>
      <h3 style={{ marginTop: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>
        {editing ? 'Edit announcement' : 'Publish a new announcement'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: '24px', alignItems: 'start' }}>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label htmlFor="ann-title" style={label}>
              Title <span style={{ fontWeight: 400, color: 'var(--text-secondary, #64748b)' }}>(Chinese or English)</span>
            </label>
            <input
              id="ann-title"
              type="text"
              value={title}
              maxLength={TITLE_MAX + 20}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 主日崇拜 Sunday Service"
              style={input}
              disabled={saving}
            />
            <p style={{ ...hint, color: titleTrim.length > TITLE_MAX ? '#dc2626' : hint.color }}>
              {titleTrim.length}/{TITLE_MAX} characters
            </p>
            {show(errors.title)}
          </div>

          <div>
            <label htmlFor="ann-image" style={label}>
              Picture {editing && <span style={{ fontWeight: 400, color: 'var(--text-secondary, #64748b)' }}>(leave empty to keep the current one)</span>}
            </label>
            <input id="ann-image" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={saving} />
            <p style={hint}>JPG or PNG. It will be resized automatically.</p>
            {show(errors.image)}
          </div>

          <div>
            <label htmlFor="ann-link" style={label}>
              Link <span style={{ fontWeight: 400, color: 'var(--text-secondary, #64748b)' }}>(optional)</span>
            </label>
            <input
              id="ann-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              style={input}
              disabled={saving}
            />
            <p style={hint}>Members tap the announcement to open this page, e.g. a sign-up form.</p>
            {show(errors.link)}
          </div>

          {progress !== null && (
            <div>
              <div style={{ height: '8px', background: 'var(--table-header-bg, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#16a34a', transition: 'width 0.2s' }} />
              </div>
              <p style={hint}>Uploading picture… {progress}%</p>
            </div>
          )}

          {error && (
            <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="submit" disabled={saving} style={button('primary', saving)}>
              {saving ? (progress !== null ? 'Uploading…' : 'Saving…') : editing ? 'Save changes' : 'Publish to members'}
            </button>
            {saving && progress !== null && (
              <button type="button" onClick={() => abortRef.current?.abort()} style={button('secondary')}>
                Cancel upload
              </button>
            )}
            {editing && !saving && (
              <button type="button" onClick={onCancelEdit} style={button('secondary')}>
                Cancel editing
              </button>
            )}
          </div>
        </form>

        {/* Preview: roughly how the card looks on the phone's home page */}
        <div>
          <p style={{ ...label, marginBottom: '8px' }}>Preview on the phone</p>
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '14px', overflow: 'hidden', background: 'var(--bg-main, #f8fafc)' }}>
            <AnnouncementImage
              storedUrl={file ? undefined : editing?.imageUrl}
              localPreview={preview}
              alt="Announcement preview"
              style={{ width: '100%', height: '150px', display: 'block' }}
            />
            <div style={{ padding: '10px 12px' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>
                {titleTrim || 'Your title appears here'}
              </p>
              {linkTrim && isValidHttpUrl(linkTrim) && <p style={{ ...hint, color: '#0284c7' }}>Tap to open link</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export const Announcements: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await getAllAnnouncements());
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Warn before closing/reloading the tab with unsaved changes.
  useEffect(() => {
    if (!formDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [formDirty]);

  // Auto-hide success messages.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const startEdit = (item: Announcement) => {
    if (formDirty && !window.confirm('You have unsaved changes in the form. Discard them?')) return;
    setEditing(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAnnouncement(toDelete.id);
      if (editing?.id === toDelete.id) setEditing(null);
      setNotice(`Deleted “${toDelete.title}”.`);
      setToDelete(null);
      await load();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((a) => a.title.toLowerCase().includes(q) || (a.announcementLink ?? '').toLowerCase().includes(q)) : items;
  }, [items, search]);

  return (
    <div>
      <AnnouncementForm
        editing={editing}
        onDirtyChange={setFormDirty}
        onCancelEdit={() => setEditing(null)}
        onSaved={() => {
          setNotice(editing ? 'Changes saved.' : 'Announcement published.');
          setEditing(null);
          void load();
        }}
      />

      {notice && (
        <div role="status" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: '14px' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>Live announcements</h3>
          <p style={hint}>Members see these on their home page. The app keeps the {SERVER_LIMIT} newest.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="search"
            placeholder="Search titles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...input, width: '220px', padding: '8px 12px', fontSize: '13px' }}
            aria-label="Search announcements"
          />
          <button type="button" onClick={() => void load()} disabled={loading} style={button('secondary', loading)}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-secondary, #64748b)' }}>Loading announcements…</p>}

      {!loading && loadError && (
        <div role="alert" style={{ ...card, borderColor: '#fecaca' }}>
          <p style={{ margin: '0 0 12px', color: '#b91c1c' }}>Could not load announcements. {loadError}</p>
          <button type="button" onClick={() => void load()} style={button('secondary')}>
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
          No announcements yet. Use the form above to publish the first one.
        </div>
      )}

      {!loading && !loadError && items.length > 0 && filtered.length === 0 && (
        <p style={{ color: 'var(--text-secondary, #64748b)' }}>No announcements match “{search}”.</p>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        {!loading &&
          !loadError &&
          filtered.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: '20px',
                alignItems: 'center',
                padding: '16px',
                border: `1px solid ${editing?.id === item.id ? '#16a34a' : 'var(--border-color, #e2e8f0)'}`,
                borderRadius: '10px',
                background: 'var(--bg-card, #ffffff)',
              }}
            >
              <AnnouncementImage storedUrl={item.imageUrl} alt={item.title} style={{ width: '130px', height: '85px', borderRadius: '6px', flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{item.title}</h4>
                {formatDate(item.createdAt) && <p style={{ ...hint, margin: '0 0 4px' }}>Published {formatDate(item.createdAt)}</p>}
                {item.announcementLink ? (
                  <a
                    href={item.announcementLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '12px', color: '#0284c7', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {item.announcementLink}
                  </a>
                ) : (
                  <p style={{ ...hint, margin: 0 }}>No link</p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button type="button" onClick={() => startEdit(item)} style={button('secondary')}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setToDelete(item);
                  }}
                  style={button('danger')}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>

      {toDelete && (
        <ConfirmDelete item={toDelete} busy={deleting} error={deleteError} onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />
      )}
    </div>
  );
};

export default Announcements;