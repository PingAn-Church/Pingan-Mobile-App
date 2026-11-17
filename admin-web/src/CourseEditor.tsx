import React, { useCallback, useEffect, useState } from 'react';
import { Category, CourseDetail, deleteCourse, getCourse, getErrorMessage, listCategories } from './api';
import { CourseList, StatusPill } from './courses/CourseList';
import { CourseDetailsForm } from './courses/CourseDetailsForm';
import { CourseContent } from './courses/CourseContent';
import { Alert, btn, card, ConfirmDialog, muted } from './courses/ui';

type View = { mode: 'list' } | { mode: 'new' } | { mode: 'edit'; courseId: string };
type Tab = 'details' | 'content';

// ---------------------------------------------------------------------------
// One course: details + content tabs
// ---------------------------------------------------------------------------
const CourseWorkspace: React.FC<{
  courseId: string | null;
  initialTab: Tab;
  onBack: () => void;
  onCreated: (courseId: string) => void;
  onDeleted: (title: string) => void;
}> = ({ courseId, initialTab, onBack, onCreated, onDeleted }) => {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(Boolean(courseId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(courseId ? initialTab : 'details');
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!courseId) return;
    const fresh = await getCourse(courseId);
    setCourse(fresh);
  }, [courseId]);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([])); // the form still works with "General"
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setLoadError(null);
    reload()
      .catch((err) => setLoadError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [courseId, reload]);

  const leave = () => {
    if (detailsDirty && !window.confirm('You have unsaved changes to the course details. Leave anyway? (A draft is kept in this browser.)')) return;
    onBack();
  };

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (tab === 'details' && detailsDirty && !window.confirm('You have unsaved changes to the course details. Switch tabs anyway? (A draft is kept in this browser.)')) return;
    setTab(next);
  };

  const doDelete = async () => {
    if (!course) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCourse(course.id);
      onDeleted(course.title);
    } catch (err) {
      setDeleteError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  const lessonCount = (course?.modules ?? []).reduce((n, s) => n + s.videos.length + s.resources.length + s.quizzes.length, 0);

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div>
        <button type="button" onClick={leave} style={{ ...btn('ghost'), paddingLeft: 0 }}>
          ← All courses
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>
            {courseId ? course?.title ?? 'Loading…' : 'New course'}
          </h3>
          {course && <StatusPill published={course.is_published} />}
        </div>
      </div>

      {loading && <p style={muted}>Loading course…</p>}

      {!loading && loadError && (
        <div style={{ ...card, borderColor: '#fecaca' }}>
          <p style={{ margin: '0 0 12px', color: '#b91c1c' }}>Could not load this course. {loadError}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => window.location.reload()} style={btn('secondary')}>
              Try again
            </button>
            <button type="button" onClick={onBack} style={btn('ghost')}>
              Back to courses
            </button>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div role="tablist" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            {(
              [
                ['details', 'Details'],
                ['content', 'Sections & lessons'],
              ] as [Tab, string][]
            ).map(([key, text]) => {
              const disabled = key === 'content' && !courseId;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  type="button"
                  disabled={disabled}
                  title={disabled ? 'Create the course first, then add sections and lessons.' : undefined}
                  onClick={() => switchTab(key)}
                  style={{
                    padding: '10px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === key ? '3px solid #16a34a' : '3px solid transparent',
                    color: disabled ? 'var(--border-color, #cbd5e1)' : tab === key ? 'var(--text-primary, #0f172a)' : 'var(--text-secondary, #64748b)',
                    fontWeight: tab === key ? 700 : 500,
                    fontSize: '15px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {text}
                  {key === 'content' && course ? <span style={{ ...muted, marginLeft: '6px' }}>({lessonCount})</span> : null}
                </button>
              );
            })}
          </div>

          <div style={card}>
            {tab === 'details' && (
              <CourseDetailsForm
                course={course}
                categories={categories}
                onDirtyChange={setDetailsDirty}
                onSaved={(id, created) => {
                  if (created) onCreated(id);
                  else void reload().catch(() => undefined);
                }}
              />
            )}
            {tab === 'content' && course && <CourseContent course={course} reload={reload} />}
          </div>

          {course && (
            <div style={{ ...card, borderColor: '#fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: 'var(--text-primary, #0f172a)' }}>Delete course</strong>
                <p style={{ ...muted, margin: '4px 0 0' }}>Removes the course, all its lessons and quizzes, and every learner's progress.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
                style={btn('danger')}
              >
                Delete course…
              </button>
            </div>
          )}
        </>
      )}

      {confirmDelete && course && (
        <ConfirmDialog
          title="Delete this course?"
          message={
            <>
              <p>
                <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{course.title}”</strong> will be permanently deleted, with its {course.modules.length}{' '}
                section{course.modules.length === 1 ? '' : 's'} and {lessonCount} lesson{lessonCount === 1 ? '' : 's'}.
              </p>
              {(course.student_count ?? 0) > 0 && (
                <p>
                  <strong style={{ color: '#b91c1c' }}>
                    {course.student_count} member{course.student_count === 1 ? ' is' : 's are'} enrolled
                  </strong>{' '}
                  and will lose their progress. Certificates already earned are kept.
                </p>
              )}
              <p>This cannot be undone. To hide a course without deleting it, untick “Published” instead.</p>
            </>
          }
          confirmLabel="Delete course"
          busy={deleting}
          error={deleteError}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void doDelete()}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Course Studio entry point (tab in App.tsx)
// ---------------------------------------------------------------------------
export const CourseEditor: React.FC = () => {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [initialTab, setInitialTab] = useState<Tab>('details');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {notice && <Alert kind="success">{notice}</Alert>}

      {view.mode === 'list' && (
        <CourseList
          onCreate={() => {
            setInitialTab('details');
            setView({ mode: 'new' });
          }}
          onOpen={(courseId) => {
            setInitialTab('details');
            setView({ mode: 'edit', courseId });
          }}
        />
      )}

      {view.mode !== 'list' && (
        <CourseWorkspace
          key={view.mode === 'edit' ? view.courseId : 'new'}
          courseId={view.mode === 'edit' ? view.courseId : null}
          initialTab={initialTab}
          onBack={() => setView({ mode: 'list' })}
          onCreated={(courseId) => {
            setNotice('Course created. Now add sections and lessons.');
            setInitialTab('content');
            setView({ mode: 'edit', courseId });
          }}
          onDeleted={(title) => {
            setNotice(`Deleted “${title}”.`);
            setView({ mode: 'list' });
          }}
        />
      )}
    </div>
  );
};

export default CourseEditor;