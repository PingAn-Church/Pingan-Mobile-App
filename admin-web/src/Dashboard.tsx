import React, { useCallback, useEffect, useState } from 'react';
import {
  countOpenReports,
  countPendingGrading,
  CourseSummary,
  getAllAnnouncements,
  getCurrentUser,
  getErrorMessage,
  listCourses,
  listMembers,
} from './api';
import { StatusPill } from './courses/CourseList';
import { btn, card, formatDate, muted } from './courses/ui';

type Tab = 'dashboard' | 'courses' | 'announcements' | 'users';

// Every number is fetched from the server. If one fails, that tile says so;
// nothing is ever filled in with a made-up value.
type Stat = { status: 'loading' } | { status: 'ok'; value: number } | { status: 'error'; message: string };

interface Stats {
  pending: Stat;
  reports: Stat;
  grading: Stat;
  members: Stat;
  admins: Stat;
  instructors: Stat;
  published: Stat;
  drafts: Stat;
  announcements: Stat;
}

const loading: Stat = { status: 'loading' };
const initialStats: Stats = {
  pending: loading,
  reports: loading,
  grading: loading,
  members: loading,
  admins: loading,
  instructors: loading,
  published: loading,
  drafts: loading,
  announcements: loading,
};

const settle = async (fn: () => Promise<number>): Promise<Stat> => {
  try {
    return { status: 'ok', value: await fn() };
  } catch (err) {
    return { status: 'error', message: getErrorMessage(err) };
  }
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const show = (s: Stat) => (s.status === 'ok' ? s.value.toLocaleString() : s.status === 'loading' ? '…' : '—');

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------
const AttentionTile: React.FC<{
  label: string;
  stat: Stat;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  comingSoon?: string;
}> = ({ label, stat, description, actionLabel, onAction, comingSoon }) => {
  const needsAction = stat.status === 'ok' && stat.value > 0;
  const accent = stat.status === 'error' ? '#94a3b8' : needsAction ? '#f59e0b' : '#16a34a';
  return (
    <div style={{ ...card, borderLeft: `4px solid ${accent}`, display: 'grid', gap: '6px', alignContent: 'start' }}>
      <span style={{ ...muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }} aria-live="polite">
        {show(stat)}
      </span>
      <span style={{ ...muted, fontSize: '12px' }}>
        {stat.status === 'error' ? `Couldn't load: ${stat.message}` : stat.status === 'ok' && stat.value === 0 ? 'All clear 🎉' : description}
      </span>
      {needsAction && onAction && actionLabel && (
        <button type="button" onClick={onAction} style={{ ...btn('primary'), justifySelf: 'start', marginTop: '4px' }}>
          {actionLabel}
        </button>
      )}
      {needsAction && comingSoon && <span style={{ ...muted, fontSize: '12px', fontStyle: 'italic' }}>{comingSoon}</span>}
    </div>
  );
};

const GlanceTile: React.FC<{ label: string; stat: Stat; sub?: string }> = ({ label, stat, sub }) => (
  <div style={{ ...card, padding: '16px', display: 'grid', gap: '4px' }} title={stat.status === 'error' ? `Couldn't load: ${stat.message}` : undefined}>
    <span style={{ ...muted, fontSize: '12px', fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>{show(stat)}</span>
    {sub && <span style={{ ...muted, fontSize: '12px' }}>{sub}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export const Dashboard: React.FC<{ onNavigate?: (tab: Tab) => void }> = ({ onNavigate }) => {
  const user = getCurrentUser();
  const isAdmin = Boolean(user?.admin);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [recent, setRecent] = useState<CourseSummary[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const notAllowed: Stat = { status: 'error', message: 'administrators only' };

    const announcementsTask = (async (): Promise<Stat> => {
      try {
        const list = await getAllAnnouncements();
        setLatestAnnouncement(list[0]?.title ?? null);
        return { status: 'ok', value: list.length };
      } catch (err) {
        return { status: 'error', message: getErrorMessage(err) };
      }
    })();

    const recentTask = listCourses({ page: 0 })
      .then((res) => {
        const sorted = [...res.courses].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
        setRecent(sorted.slice(0, 5));
        setRecentError(null);
      })
      .catch((err) => setRecentError(getErrorMessage(err)));

    const [pending, reports, grading, members, admins, instructors, published, drafts, announcements] = await Promise.all([
      isAdmin ? settle(async () => (await listMembers({ verified: false })).totalCount) : Promise.resolve(notAllowed),
      isAdmin ? settle(countOpenReports) : Promise.resolve(notAllowed),
      settle(countPendingGrading),
      isAdmin ? settle(async () => (await listMembers({ verified: true })).totalCount) : Promise.resolve(notAllowed),
      isAdmin ? settle(async () => (await listMembers({ role: 'admin' })).totalCount) : Promise.resolve(notAllowed),
      isAdmin ? settle(async () => (await listMembers({ role: 'instructor' })).totalCount) : Promise.resolve(notAllowed),
      settle(async () => (await listCourses({ published: true })).totalCount),
      settle(async () => (await listCourses({ published: false })).totalCount),
      announcementsTask,
    ]);
    await recentTask;

    setStats({ pending, reports, grading, members, admins, instructors, published, drafts, announcements });
    setUpdatedAt(new Date());
    setRefreshing(false);
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName = user?.firstName?.trim() || user?.email || '';

  return (
    <div style={{ display: 'grid', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: 'var(--text-primary, #0f172a)' }}>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h2>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {updatedAt ? ` · Updated ${updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={refreshing} style={btn('secondary', refreshing)}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <section aria-labelledby="attention-heading">
        <h3 id="attention-heading" style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>
          Needs your attention
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {isAdmin && (
            <AttentionTile
              label="New members waiting for approval"
              stat={stats.pending}
              description="They can't use chat or events until approved."
              actionLabel="Review sign-ups"
              onAction={onNavigate ? () => onNavigate('users') : undefined}
            />
          )}
          {isAdmin && (
            <AttentionTile
              label="Reported messages"
              stat={stats.reports}
              description="Messages members have flagged for review."
              comingSoon="The review screen is coming in the next update."
            />
          )}
          <AttentionTile
            label="Short answers to grade"
            stat={stats.grading}
            description="Quiz answers waiting for an instructor."
            comingSoon="The grading queue is coming in the next update."
          />
        </div>
      </section>

      <section aria-labelledby="glance-heading">
        <h3 id="glance-heading" style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>
          At a glance
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
          {isAdmin && <GlanceTile label="Approved members" stat={stats.members} />}
          {isAdmin && <GlanceTile label="Administrators" stat={stats.admins} />}
          {isAdmin && <GlanceTile label="Instructors" stat={stats.instructors} />}
          <GlanceTile label="Published courses" stat={stats.published} />
          <GlanceTile label="Draft courses" stat={stats.drafts} />
          <GlanceTile label="Live announcements" stat={stats.announcements} sub={latestAnnouncement ? `Latest: ${latestAnnouncement}` : undefined} />
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 id="recent-heading" style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>
            Recently updated courses
          </h3>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('courses')} style={btn('ghost')}>
              Open Course Studio →
            </button>
          )}
        </div>
        <div style={{ ...card, padding: 0 }}>
          {recent === null && !recentError && <p style={{ ...muted, padding: '16px', margin: 0 }}>Loading…</p>}
          {recentError && <p style={{ padding: '16px', margin: 0, color: '#b91c1c', fontSize: '14px' }}>Couldn't load courses: {recentError}</p>}
          {recent && recent.length === 0 && <p style={{ ...muted, padding: '16px', margin: 0 }}>No courses yet.</p>}
          {recent?.map((c, i) => (
            <div
              key={c.id}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border-color, #e2e8f0)' }}
            >
              <StatusPill published={c.is_published} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{c.title}</span>
              <span style={{ ...muted, fontSize: '12px', whiteSpace: 'nowrap' }}>
                {c.total_sections ?? 0} sections · {(c.total_videos ?? 0) + (c.total_quizzes ?? 0)} lessons
                {c.updated_at ? ` · ${formatDate(c.updated_at)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;