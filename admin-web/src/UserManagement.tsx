import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage, listMembers, markNewMembersSeen, Member, setMemberVerified } from './api';

// ---------------------------------------------------------------------------
// Styles (theme variables from App.tsx so dark mode works)
// ---------------------------------------------------------------------------
const card: React.CSSProperties = {
  background: 'var(--bg-card, #ffffff)',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid var(--border-color, #e2e8f0)',
};
const muted: React.CSSProperties = { color: 'var(--text-secondary, #64748b)', fontSize: '13px' };
const input: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color, #cbd5e1)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #0f172a)',
  fontSize: '14px',
  boxSizing: 'border-box',
};
const button = (kind: 'primary' | 'secondary' | 'danger', disabled = false): React.CSSProperties => ({
  padding: '9px 16px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  border: kind === 'secondary' ? '1px solid var(--border-color, #cbd5e1)' : kind === 'danger' ? '1px solid #fecaca' : 'none',
  background: kind === 'primary' ? '#16a34a' : kind === 'danger' ? '#fef2f2' : 'var(--bg-card, #ffffff)',
  color: kind === 'primary' ? '#ffffff' : kind === 'danger' ? '#dc2626' : 'var(--text-primary, #0f172a)',
  whiteSpace: 'nowrap',
});

const fullName = (m: Member) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email;

// Run tasks a few at a time so 30 approvals don't hammer the server at once.
async function runWithLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>, onDone: () => void) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
      } finally {
        onDone();
      }
    }
  });
  await Promise.all(workers);
}

type Tab = 'pending' | 'members';

interface BulkResult {
  succeeded: number;
  failed: { member: Member; reason: string }[];
  action: 'approve' | 'unapprove';
}

// ---------------------------------------------------------------------------
// Confirmation dialog: says exactly who and what
// ---------------------------------------------------------------------------
const ConfirmDialog: React.FC<{
  title: string;
  people: Member[];
  explanation: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ title, people, explanation, confirmLabel, danger, onCancel, onConfirm }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const shown = people.slice(0, 8);
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 900 }}
    >
      <div style={{ ...card, maxWidth: '460px', width: '100%', padding: '24px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary, #0f172a)' }}>{title}</h3>
        <ul style={{ margin: '0 0 12px', paddingLeft: '20px', color: 'var(--text-primary, #0f172a)', fontSize: '14px' }}>
          {shown.map((m) => (
            <li key={m.id}>
              {fullName(m)} <span style={muted}>({m.email})</span>
            </li>
          ))}
          {people.length > shown.length && <li style={muted}>…and {people.length - shown.length} more</li>}
        </ul>
        <p style={{ ...muted, fontSize: '14px' }}>{explanation}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={onCancel} style={button('secondary')} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={button(danger ? 'danger' : 'primary')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export const UserManagement: React.FC = () => {
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced search actually sent
  const [members, setMembers] = useState<Member[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ action: 'approve' | 'unapprove'; people: Member[] } | null>(null);
  const [working, setWorking] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const requestId = useRef(0);

  // Debounce typing so we search 300ms after the user stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (pageToLoad: number) => {
      const id = ++requestId.current; // ignore out-of-date responses
      pageToLoad === 0 ? setLoading(true) : setLoadingMore(true);
      setLoadError(null);
      try {
        const res = await listMembers({ q: query, verified: tab === 'members', page: pageToLoad });
        if (id !== requestId.current) return;
        setMembers((prev) => (pageToLoad === 0 ? res.members : [...prev, ...res.members]));
        setTotalCount(res.totalCount);
        setHasMore(res.hasMore);
        setPage(pageToLoad);
      } catch (err) {
        if (id === requestId.current) setLoadError(getErrorMessage(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, tab]
  );

  useEffect(() => {
    setSelected(new Set());
    void load(0);
  }, [load]);

  // Opening the queue counts as "seen", like on the phone.
  useEffect(() => {
    if (tab === 'pending') void markNewMembersSeen();
  }, [tab]);

  const allLoadedSelected = members.length > 0 && members.every((m) => selected.has(m.id));
  const selectedMembers = useMemo(() => members.filter((m) => selected.has(m.id)), [members, selected]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allLoadedSelected ? new Set() : new Set(members.map((m) => m.id)));

  const run = async (action: 'approve' | 'unapprove', people: Member[]) => {
    setConfirm(null);
    setResult(null);
    setWorking({ done: 0, total: people.length });
    const failed: BulkResult['failed'] = [];
    const succeededIds = new Set<number>();

    await runWithLimit(
      people,
      3,
      async (m) => {
        try {
          await setMemberVerified(m.id, action === 'approve');
          succeededIds.add(m.id);
        } catch (err) {
          failed.push({ member: m, reason: getErrorMessage(err) });
        }
      },
      () => setWorking((w) => (w ? { ...w, done: w.done + 1 } : w))
    );

    // People who moved to the other tab leave this list straight away.
    setMembers((prev) => prev.filter((m) => !succeededIds.has(m.id)));
    setTotalCount((c) => Math.max(0, c - succeededIds.size));
    setSelected(new Set(failed.map((f) => f.member.id))); // keep failures selected for an easy retry
    setResult({ succeeded: succeededIds.size, failed, action });
    setWorking(null);
  };

  const busy = working !== null;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
        {(
          [
            ['pending', 'Waiting for approval'],
            ['members', 'Approved members'],
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => {
              setTab(key);
              setResult(null);
            }}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: tab === key ? '3px solid #16a34a' : '3px solid transparent',
              color: tab === key ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
              fontWeight: tab === key ? 700 : 500,
              fontSize: '15px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {text}
            {tab === key && !loading && !loadError && <span style={{ ...muted, marginLeft: '6px' }}>({totalCount})</span>}
          </button>
        ))}
      </div>

      <p style={{ ...muted, marginTop: 0 }}>
        {tab === 'pending'
          ? 'New sign-ups can only use chat, events and other members-only features after an administrator approves them.'
          : 'Approved members have full access. Remove approval only if someone was approved by mistake.'}
      </p>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '16px 0' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search members"
          style={{ ...input, width: '280px' }}
        />
        <button type="button" onClick={() => void load(0)} disabled={loading || busy} style={button('secondary', loading || busy)}>
          Refresh
        </button>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && <span style={muted}>{selected.size} selected</span>}
        {tab === 'pending' ? (
          <button
            type="button"
            disabled={selected.size === 0 || busy}
            onClick={() => setConfirm({ action: 'approve', people: selectedMembers })}
            style={button('primary', selected.size === 0 || busy)}
          >
            Approve selected
          </button>
        ) : (
          <button
            type="button"
            disabled={selected.size === 0 || busy}
            onClick={() => setConfirm({ action: 'unapprove', people: selectedMembers })}
            style={button('danger', selected.size === 0 || busy)}
          >
            Remove approval
          </button>
        )}
      </div>

      {/* Progress */}
      {working && (
        <div role="status" style={{ ...card, marginBottom: '16px', padding: '14px 16px' }}>
          <div style={{ height: '8px', background: 'var(--table-header-bg, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(working.done / working.total) * 100}%`, height: '100%', background: '#16a34a', transition: 'width 0.2s' }} />
          </div>
          <p style={{ ...muted, margin: '8px 0 0' }}>
            Working… {working.done} of {working.total}. Please keep this page open.
          </p>
        </div>
      )}

      {/* Result report */}
      {result && (
        <div
          role="status"
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: `1px solid ${result.failed.length ? '#fecaca' : '#bbf7d0'}`,
            background: result.failed.length ? '#fef2f2' : '#f0fdf4',
            color: result.failed.length ? '#991b1b' : '#15803d',
            fontSize: '14px',
          }}
        >
          {result.succeeded > 0 && (
            <div>
              {result.action === 'approve' ? 'Approved' : 'Removed approval for'} {result.succeeded}{' '}
              {result.succeeded === 1 ? 'person' : 'people'}.
            </div>
          )}
          {result.failed.length > 0 && (
            <>
              <div style={{ marginTop: result.succeeded ? '6px' : 0 }}>
                {result.failed.length} could not be updated. They are still selected, so you can try again:
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                {result.failed.slice(0, 5).map((f) => (
                  <li key={f.member.id}>
                    {fullName(f.member)}: {f.reason}
                  </li>
                ))}
                {result.failed.length > 5 && <li>…and {result.failed.length - 5} more</li>}
              </ul>
            </>
          )}
        </div>
      )}

      {/* States */}
      {loading && <p style={muted}>Loading…</p>}

      {!loading && loadError && (
        <div role="alert" style={{ ...card, borderColor: '#fecaca' }}>
          <p style={{ margin: '0 0 12px', color: '#b91c1c' }}>Could not load members. {loadError}</p>
          <button type="button" onClick={() => void load(0)} style={button('secondary')}>
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && members.length === 0 && (
        <div style={{ ...card, textAlign: 'center', ...muted, fontSize: '14px' }}>
          {query
            ? `No one matches “${query}”.`
            : tab === 'pending'
            ? 'No one is waiting for approval. 🎉'
            : 'No approved members yet.'}
        </div>
      )}

      {/* Table */}
      {!loading && !loadError && members.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f8fafc)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', width: '40px' }}>
                  <input type="checkbox" checked={allLoadedSelected} onChange={toggleAll} disabled={busy} aria-label="Select all shown" />
                </th>
                <th style={{ padding: '12px 8px' }}>Name</th>
                <th style={{ padding: '12px 8px' }}>Email</th>
                <th style={{ padding: '12px 8px' }}>Roles</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  style={{
                    borderTop: '1px solid var(--border-color, #e2e8f0)',
                    background: selected.has(m.id) ? 'rgba(22,163,74,0.07)' : undefined,
                  }}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)}
                      disabled={busy}
                      aria-label={`Select ${fullName(m)}`}
                    />
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{fullName(m)}</td>
                  <td style={{ padding: '10px 8px', ...muted, fontSize: '14px' }}>{m.email}</td>
                  <td style={{ padding: '10px 8px' }}>
                    {m.admin && <RoleTag text="Administrator" color="#7c3aed" />}
                    {m.instructor && <RoleTag text="Instructor" color="#0284c7" />}
                    {!m.admin && !m.instructor && <span style={muted}>Member</span>}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    {tab === 'pending' ? (
                      <button type="button" disabled={busy} onClick={() => setConfirm({ action: 'approve', people: [m] })} style={button('primary', busy)}>
                        Approve
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setConfirm({ action: 'unapprove', people: [m] })} style={button('danger', busy)}>
                        Remove approval
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && members.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
          <span style={muted}>
            Showing {members.length} of {totalCount}
          </span>
          {hasMore && (
            <button type="button" onClick={() => void load(page + 1)} disabled={loadingMore || busy} style={button('secondary', loadingMore || busy)}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.action === 'approve'
              ? `Approve ${confirm.people.length} ${confirm.people.length === 1 ? 'person' : 'people'}?`
              : `Remove approval for ${confirm.people.length} ${confirm.people.length === 1 ? 'person' : 'people'}?`
          }
          people={confirm.people}
          explanation={
            confirm.action === 'approve'
              ? 'They will immediately get access to chat, events and the church group, and are added to the app-wide group chat.'
              : 'They will immediately lose access to chat, events and the church group, and be removed from the app-wide group chat. Their account is not deleted.'
          }
          confirmLabel={confirm.action === 'approve' ? 'Approve' : 'Remove approval'}
          danger={confirm.action === 'unapprove'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(confirm.action, confirm.people)}
        />
      )}
    </div>
  );
};

const RoleTag: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <span
    style={{
      display: 'inline-block',
      marginRight: '6px',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: 600,
      color,
      background: `${color}1a`,
      border: `1px solid ${color}40`,
    }}
  >
    {text}
  </span>
);

export default UserManagement;