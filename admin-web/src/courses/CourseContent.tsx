import React, { useState } from 'react';
import {
  CourseDetail,
  CourseSection,
  createCourseResource,
  createCourseVideo,
  createSection,
  deleteCourseResource,
  deleteCourseVideo,
  deleteQuiz,
  deleteSection,
  getErrorMessage,
  QuizLesson,
  ResourceLesson,
  updateCourseResource,
  updateCourseVideo,
  updateQuiz,
  updateSection,
  VideoLesson,
} from '../api';
import { QuizQuestionsModal, QuizSettingsModal } from './QuizEditor';
import { Alert, btn, card, ConfirmDialog, errorText, inputStyle, isHttpUrl, labelStyle, Modal, muted } from './ui';

interface Props {
  course: CourseDetail;
  /** Reload the course from the server after any change. */
  reload: () => Promise<void>;
}

const RESOURCE_TYPES: [string, string][] = [
  ['pdf', 'PDF'],
  ['document', 'Word document'],
  ['ppt', 'Slides'],
  ['link', 'Web page'],
];

const formatMinutes = (seconds?: number | null) => {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

// ---------------------------------------------------------------------------
// Section create / rename
// ---------------------------------------------------------------------------
const SectionModal: React.FC<{
  courseId: string;
  section: CourseSection | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ courseId, section, nextOrder, onClose, onSaved }) => {
  const [title, setTitle] = useState(section?.title ?? '');
  const [description, setDescription] = useState(section?.description ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleError = !title.trim() ? 'Please enter a section title.' : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || titleError) return;
    setSaving(true);
    setError(null);
    try {
      if (section) await updateSection(section.id, { title: title.trim(), description: description.trim() });
      else await createSection({ courseId, title: title.trim(), description: description.trim(), orderIndex: nextOrder });
      await onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal title={section ? 'Rename section' : 'Add a section'} onClose={onClose} busy={saving}>
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label htmlFor="section-title" style={labelStyle}>
            Section title
          </label>
          <input id="section-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 第一课 Week 1: The Gospels" style={inputStyle} disabled={saving} />
          {touched && titleError && <p style={errorText}>{titleError}</p>}
        </div>
        <div>
          <label htmlFor="section-desc" style={labelStyle}>
            Short description <span style={{ fontWeight: 400, ...muted }}>(optional)</span>
          </label>
          <textarea id="section-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} disabled={saving} />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn('secondary', saving)}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={btn('primary', saving)}>
            {saving ? 'Saving…' : section ? 'Save' : 'Add section'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Lesson (video or reading) create / edit
// ---------------------------------------------------------------------------
type LessonTarget =
  | { kind: 'video'; sectionId: string; lesson: VideoLesson | null; nextOrder: number }
  | { kind: 'resource'; sectionId: string; lesson: ResourceLesson | null; nextOrder: number };

const LessonModal: React.FC<{ courseId: string; target: LessonTarget; onClose: () => void; onSaved: () => Promise<void> }> = ({
  courseId,
  target,
  onClose,
  onSaved,
}) => {
  const isVideo = target.kind === 'video';
  const video = isVideo ? (target.lesson as VideoLesson | null) : null;
  const resource = !isVideo ? (target.lesson as ResourceLesson | null) : null;

  const [title, setTitle] = useState(target.lesson?.title ?? '');
  const [description, setDescription] = useState(target.lesson?.description ?? '');
  const [url, setUrl] = useState((isVideo ? video?.video_url : resource?.resource_url) ?? '');
  const [minutes, setMinutes] = useState(video?.duration_seconds ? String(Math.round(video.duration_seconds / 60)) : '');
  const [resourceType, setResourceType] = useState(resource?.resource_type ?? 'pdf');
  const [isPreview, setIsPreview] = useState(Boolean(target.lesson?.is_preview));
  const [isDownloadable, setIsDownloadable] = useState(resource ? resource.is_downloadable !== false : true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutesNum = minutes.trim() === '' ? 0 : Number(minutes);
  const errors = {
    title: !title.trim() ? 'Please enter a title.' : null,
    url: !url.trim() ? (isVideo ? 'Paste the video link.' : 'Paste the link to the file or page.') : !isHttpUrl(url.trim()) ? 'The link must start with http:// or https://' : null,
    minutes: Number.isNaN(minutesNum) || minutesNum < 0 ? 'Enter the length in minutes.' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || hasErrors) return;
    setSaving(true);
    setError(null);
    try {
      if (target.kind === 'video') {
        const body = {
          courseId,
          sectionId: target.sectionId,
          title: title.trim(),
          description: description.trim(),
          videoUrl: url.trim(),
          durationSeconds: Math.round(minutesNum * 60),
          isPreview,
        };
        if (target.lesson) await updateCourseVideo(target.lesson.id, body);
        else await createCourseVideo({ ...body, orderIndex: target.nextOrder });
      } else {
        const body = {
          courseId,
          sectionId: target.sectionId,
          title: title.trim(),
          description: description.trim(),
          resourceUrl: url.trim(),
          resourceType,
          isDownloadable,
          isPreview,
        };
        if (target.lesson) await updateCourseResource(target.lesson.id, body);
        else await createCourseResource({ ...body, orderIndex: target.nextOrder });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const show = (msg: string | null) => (touched && msg ? <p style={errorText}>{msg}</p> : null);
  const heading = `${target.lesson ? 'Edit' : 'Add'} ${isVideo ? 'video' : 'reading'} lesson`;

  return (
    <Modal title={heading} onClose={onClose} busy={saving}>
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label htmlFor="lesson-title" style={labelStyle}>
            Title
          </label>
          <input id="lesson-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} disabled={saving} />
          {show(errors.title)}
        </div>
        <div>
          <label htmlFor="lesson-url" style={labelStyle}>
            {isVideo ? 'Video link' : 'Link to the file or page'}
          </label>
          <input
            id="lesson-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={isVideo ? 'https://www.youtube.com/watch?v=…' : 'https://…'}
            style={inputStyle}
            disabled={saving}
          />
          {show(errors.url)}
        </div>
        {isVideo ? (
          <div>
            <label htmlFor="lesson-minutes" style={labelStyle}>
              Length (minutes)
            </label>
            <input id="lesson-minutes" type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ ...inputStyle, width: '160px' }} disabled={saving} />
            {show(errors.minutes)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label htmlFor="lesson-type" style={labelStyle}>
                Type
              </label>
              <select id="lesson-type" value={resourceType} onChange={(e) => setResourceType(e.target.value)} style={{ ...inputStyle, width: '200px' }} disabled={saving}>
                {RESOURCE_TYPES.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>
              <input type="checkbox" checked={isDownloadable} onChange={(e) => setIsDownloadable(e.target.checked)} disabled={saving} />
              Learners can download it
            </label>
          </div>
        )}
        <div>
          <label htmlFor="lesson-desc" style={labelStyle}>
            Description <span style={{ fontWeight: 400, ...muted }}>(optional)</span>
          </label>
          <textarea id="lesson-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} disabled={saving} />
        </div>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>
          <input type="checkbox" checked={isPreview} onChange={(e) => setIsPreview(e.target.checked)} disabled={saving} style={{ marginTop: '3px' }} />
          <span>
            Free preview
            <span style={{ ...muted, display: 'block' }}>People can open this lesson before enrolling.</span>
          </span>
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn('secondary', saving)}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={btn('primary', saving)}>
            {saving ? 'Saving…' : target.lesson ? 'Save' : 'Add lesson'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Content screen
// ---------------------------------------------------------------------------
type PendingDelete =
  | { kind: 'section'; section: CourseSection }
  | { kind: 'video'; lesson: VideoLesson }
  | { kind: 'resource'; lesson: ResourceLesson }
  | { kind: 'quiz'; lesson: QuizLesson };

type AnyLesson = VideoLesson | ResourceLesson | QuizLesson;

export const CourseContent: React.FC<Props> = ({ course, reload }) => {
  const sections = [...course.modules].sort((a, b) => a.order_index - b.order_index);
  const [sectionModal, setSectionModal] = useState<{ section: CourseSection | null } | null>(null);
  const [lessonTarget, setLessonTarget] = useState<LessonTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [quizSettings, setQuizSettings] = useState<{ sectionId: string; quiz: QuizLesson | null; nextOrder: number } | null>(null);
  const [questionsFor, setQuestionsFor] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reorder by giving every section a clean 0..n index in the new order.
  // Only sections whose position changed are sent to the server.
  const moveSection = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (moving || target < 0 || target >= sections.length) return;
    const reordered = [...sections];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMoving(true);
    setError(null);
    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order_index !== i) await updateSection(reordered[i].id, { orderIndex: i });
      }
    } catch (err) {
      setError(`Could not finish reordering: ${getErrorMessage(err)} The list below shows the current saved order.`);
    } finally {
      await reload().catch(() => undefined);
      setMoving(false);
    }
  };

  const moveLesson = async (list: AnyLesson[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (moving || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMoving(true);
    setError(null);
    try {
      for (let i = 0; i < reordered.length; i++) {
        const l = reordered[i];
        if (l.order_index === i) continue;
        if (l.type === 'video') await updateCourseVideo(l.id, { orderIndex: i });
        else if (l.type === 'resource') await updateCourseResource(l.id, { orderIndex: i });
        else await updateQuiz(l.id, { orderIndex: i });
      }
    } catch (err) {
      setError(`Could not finish reordering: ${getErrorMessage(err)}`);
    } finally {
      await reload().catch(() => undefined);
      setMoving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (pendingDelete.kind === 'section') await deleteSection(pendingDelete.section.id);
      else if (pendingDelete.kind === 'video') await deleteCourseVideo(pendingDelete.lesson.id);
      else if (pendingDelete.kind === 'resource') await deleteCourseResource(pendingDelete.lesson.id);
      else await deleteQuiz(pendingDelete.lesson.id);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const deleteMessage = (p: PendingDelete): React.ReactNode => {
    if (p.kind === 'section') {
      const s = p.section;
      const parts = [
        s.videos.length && `${s.videos.length} video${s.videos.length > 1 ? 's' : ''}`,
        s.resources.length && `${s.resources.length} reading${s.resources.length > 1 ? 's' : ''}`,
        s.quizzes.length && `${s.quizzes.length} quiz${s.quizzes.length > 1 ? 'zes' : ''} (with all learners' attempts)`,
      ].filter(Boolean);
      return (
        <>
          <p>
            <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{s.title}”</strong> will be deleted
            {parts.length ? <> together with {parts.join(', ')}</> : ' (it is empty)'}.
          </p>
          <p>Learners' progress on these lessons is removed too. This cannot be undone.</p>
        </>
      );
    }
    if (p.kind === 'quiz') {
      return (
        <p>
          The quiz <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{p.lesson.title}”</strong> will be deleted with all its questions and{' '}
          <strong style={{ color: '#b91c1c' }}>every learner's attempts and scores</strong>. This cannot be undone.
        </p>
      );
    }
    return (
      <p>
        <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{p.lesson.title}”</strong> will be removed from the course, along with learners' progress on it.
        This cannot be undone.
      </p>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ ...muted, margin: 0 }}>Organise the course into sections, then add videos, readings and quizzes to each one. Use the arrows to change the order.</p>
        <button type="button" onClick={() => setSectionModal({ section: null })} style={btn('primary')}>
          + Add section
        </button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {moving && <p style={muted}>Saving new order…</p>}

      {sections.length === 0 && (
        <div style={{ ...card, textAlign: 'center', ...muted, fontSize: '14px' }}>No sections yet. Add the first section to start building the course.</div>
      )}

      {sections.map((section, index) => {
        const videos = [...section.videos].sort((a, b) => a.order_index - b.order_index);
        const resources = [...section.resources].sort((a, b) => a.order_index - b.order_index);
        const quizzes = [...section.quizzes].sort((a, b) => a.order_index - b.order_index);
        return (
          <div key={section.id} style={{ ...card, padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button type="button" aria-label={`Move ${section.title} up`} disabled={moving || index === 0} onClick={() => void moveSection(index, -1)} style={btn('ghost', moving || index === 0)}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${section.title} down`}
                  disabled={moving || index === sections.length - 1}
                  onClick={() => void moveSection(index, 1)}
                  style={btn('ghost', moving || index === sections.length - 1)}
                >
                  ▼
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...muted, fontSize: '12px' }}>Section {index + 1}</span>
                <h4 style={{ margin: '2px 0 0', fontSize: '16px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{section.title}</h4>
                {section.description && <p style={{ ...muted, margin: '4px 0 0' }}>{section.description}</p>}
              </div>
              <button type="button" onClick={() => setSectionModal({ section })} style={btn('secondary')}>
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setPendingDelete({ kind: 'section', section });
                }}
                style={btn('danger')}
              >
                Delete
              </button>
            </div>

            <div style={{ padding: '12px 16px', display: 'grid', gap: '8px' }}>
              {videos.length + resources.length + section.quizzes.length === 0 && <p style={{ ...muted, margin: 0 }}>No lessons in this section yet.</p>}

              {[videos, resources].map((list) =>
                list.map((lesson, i) => (
                  <div key={`${lesson.type}-${lesson.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-main, #f8fafc)' }}>
                    <span aria-hidden style={{ fontSize: '18px' }}>
                      {lesson.type === 'video' ? '🎬' : '📄'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{lesson.title}</div>
                      <div style={{ ...muted, fontSize: '12px' }}>
                        {lesson.type === 'video'
                          ? ['Video', formatMinutes(lesson.duration_seconds)].filter(Boolean).join(' · ')
                          : `Reading · ${RESOURCE_TYPES.find(([v]) => v === lesson.resource_type)?.[1] ?? lesson.resource_type ?? 'File'}`}
                        {lesson.is_preview ? ' · Free preview' : ''}
                      </div>
                    </div>
                    <button type="button" aria-label="Move up" disabled={moving || i === 0} onClick={() => void moveLesson(list, i, -1)} style={btn('ghost', moving || i === 0)}>
                      ▲
                    </button>
                    <button type="button" aria-label="Move down" disabled={moving || i === list.length - 1} onClick={() => void moveLesson(list, i, 1)} style={btn('ghost', moving || i === list.length - 1)}>
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLessonTarget(
                          lesson.type === 'video'
                            ? { kind: 'video', sectionId: section.id, lesson, nextOrder: videos.length }
                            : { kind: 'resource', sectionId: section.id, lesson, nextOrder: resources.length }
                        )
                      }
                      style={btn('ghost')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(lesson.type === 'video' ? { kind: 'video', lesson } : { kind: 'resource', lesson });
                      }}
                      style={{ ...btn('ghost'), color: '#dc2626' }}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}

              {quizzes.map((quiz, i) => (
                <div key={`quiz-${quiz.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-main, #f8fafc)' }}>
                  <span aria-hidden style={{ fontSize: '18px' }}>
                    📝
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{quiz.title}</div>
                    <div style={{ ...muted, fontSize: '12px' }}>
                      Quiz · pass mark {quiz.passing_score ?? 70}%{quiz.max_attempts ? ` · ${quiz.max_attempts} attempts` : ' · unlimited attempts'}
                    </div>
                  </div>
                  <button type="button" aria-label="Move up" disabled={moving || i === 0} onClick={() => void moveLesson(quizzes, i, -1)} style={btn('ghost', moving || i === 0)}>
                    ▲
                  </button>
                  <button type="button" aria-label="Move down" disabled={moving || i === quizzes.length - 1} onClick={() => void moveLesson(quizzes, i, 1)} style={btn('ghost', moving || i === quizzes.length - 1)}>
                    ▼
                  </button>
                  <button type="button" onClick={() => setQuestionsFor(quiz.id)} style={{ ...btn('ghost'), color: '#15803d' }}>
                    Questions
                  </button>
                  <button type="button" onClick={() => setQuizSettings({ sectionId: section.id, quiz, nextOrder: quizzes.length })} style={btn('ghost')}>
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete({ kind: 'quiz', lesson: quiz });
                    }}
                    style={{ ...btn('ghost'), color: '#dc2626' }}
                  >
                    Delete
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={() => setQuizSettings({ sectionId: section.id, quiz: null, nextOrder: quizzes.length })} style={btn('secondary')}>
                  + Quiz
                </button>
                <button type="button" onClick={() => setLessonTarget({ kind: 'video', sectionId: section.id, lesson: null, nextOrder: videos.length })} style={btn('secondary')}>
                  + Video
                </button>
                <button type="button" onClick={() => setLessonTarget({ kind: 'resource', sectionId: section.id, lesson: null, nextOrder: resources.length })} style={btn('secondary')}>
                  + Reading
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {sectionModal && (
        <SectionModal courseId={course.id} section={sectionModal.section} nextOrder={sections.length} onClose={() => setSectionModal(null)} onSaved={reload} />
      )}
      {lessonTarget && <LessonModal courseId={course.id} target={lessonTarget} onClose={() => setLessonTarget(null)} onSaved={reload} />}
      {quizSettings && (
        <QuizSettingsModal
          courseId={course.id}
          sectionId={quizSettings.sectionId}
          quiz={quizSettings.quiz}
          nextOrder={quizSettings.nextOrder}
          onClose={() => setQuizSettings(null)}
          onSaved={async (newQuizId) => {
            await reload();
            if (newQuizId) setQuestionsFor(newQuizId); // go straight to adding questions
          }}
        />
      )}
      {questionsFor && <QuizQuestionsModal quizId={questionsFor} onClose={() => setQuestionsFor(null)} onChanged={() => void reload().catch(() => undefined)} />}
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'section' ? 'Delete this section?' : 'Delete this lesson?'}
          message={deleteMessage(pendingDelete)}
          confirmLabel={pendingDelete.kind === 'section' ? 'Delete section' : 'Delete lesson'}
          busy={deleting}
          error={deleteError}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
};