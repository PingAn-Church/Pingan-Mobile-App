import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CourseSummary, getErrorMessage, listCourses } from '../api';
import { btn, card, CoverImage, formatDate, inputStyle, muted } from './ui';

type Filter = 'all' | 'published' | 'drafts';

export const CourseList: React.FC<{ onOpen: (courseId: string) => void; onCreate: () => void }> = ({ onOpen, onCreate }) => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (pageToLoad: number) => {
      const id = ++requestId.current;
      if (pageToLoad === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await listCourses({
          q: query,
          published: filter === 'all' ? undefined : filter === 'published',
          page: pageToLoad,
        });
        if (id !== requestId.current) return;
        setCourses((prev) => (pageToLoad === 0 ? res.courses : [...prev, ...res.courses]));
        setTotalCount(res.totalCount);
        setHasMore(res.hasMore);
        setPage(pageToLoad);
      } catch (err) {
        if (id === requestId.current) setError(getErrorMessage(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, filter]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary, #0f172a)' }}>Courses</h3>
          <p style={{ ...muted, margin: '4px 0 0' }}>Administrators see every course. Instructors see the courses they created.</p>
        </div>
        <button type="button" onClick={onCreate} style={btn('primary')}>
          + New course
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or instructor…"
          aria-label="Search courses"
          style={{ ...inputStyle, width: '280px' }}
        />
        <div role="group" aria-label="Filter courses" style={{ display: 'flex', gap: '6px' }}>
          {(
            [
              ['all', 'All'],
              ['published', 'Published'],
              ['drafts', 'Drafts'],
            ] as [Filter, string][]
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              style={{
                ...btn('secondary'),
                background: filter === key ? '#16a34a' : 'var(--bg-card, #ffffff)',
                color: filter === key ? '#ffffff' : 'var(--text-primary, #0f172a)',
                borderColor: filter === key ? '#16a34a' : 'var(--border-color, #cbd5e1)',
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void load(0)} disabled={loading} style={btn('secondary', loading)}>
          Refresh
        </button>
      </div>

      {loading && <p style={muted}>Loading courses…</p>}

      {!loading && error && (
        <div style={{ ...card, borderColor: '#fecaca' }}>
          <p style={{ margin: '0 0 12px', color: '#b91c1c' }}>Could not load courses. {error}</p>
          <button type="button" onClick={() => void load(0)} style={btn('secondary')}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <div style={{ ...card, textAlign: 'center', ...muted, fontSize: '14px' }}>
          {query || filter !== 'all' ? 'No courses match.' : 'No courses yet. Click “New course” to create the first one.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {!loading &&
          !error &&
          courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id)}
              style={{ ...card, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            >
              <CoverImage storedUrl={c.thumbnail_url} alt="" style={{ width: '100%', height: '130px', display: 'block' }} />
              <div style={{ padding: '14px 16px', display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <StatusPill published={c.is_published} />
                  {c.category_name && <span style={{ ...muted, fontSize: '12px' }}>{c.category_name}</span>}
                </div>
                <strong style={{ fontSize: '15px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{c.title}</strong>
                <span style={{ ...muted, fontSize: '12px' }}>
                  {c.total_sections ?? 0} sections · {c.total_videos ?? 0} videos · {c.total_quizzes ?? 0} quizzes
                </span>
                <span style={{ ...muted, fontSize: '12px' }}>
                  {c.instructor_name ? `By ${c.instructor_name}` : ''}
                  {c.updated_at ? ` · Updated ${formatDate(c.updated_at)}` : ''}
                </span>
              </div>
            </button>
          ))}
      </div>

      {!loading && !error && courses.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <span style={muted}>
            Showing {courses.length} of {totalCount}
          </span>
          {hasMore && (
            <button type="button" onClick={() => void load(page + 1)} disabled={loadingMore} style={btn('secondary', loadingMore)}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const StatusPill: React.FC<{ published: boolean }> = ({ published }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      color: published ? '#15803d' : '#92400e',
      background: published ? '#dcfce7' : '#fef3c7',
    }}
  >
    {published ? 'Published' : 'Draft'}
  </span>
);