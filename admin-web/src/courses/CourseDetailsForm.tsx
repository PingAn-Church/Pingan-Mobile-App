import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Category,
  CourseDetail,
  CourseInput,
  createCourse,
  deleteOwnUpload,
  getErrorMessage,
  setCourseOutcomes,
  updateCourse,
  uploadImage,
  UploadCancelledError,
} from '../api';
import { Alert, btn, card, CoverImage, errorText, inputStyle, labelStyle, muted, useUnsavedWarning } from './ui';

const TITLE_MAX = 120;
const NEW_CATEGORY = '__new__';

interface Values {
  title: string;
  description: string;
  categoryName: string;
  newCategory: string;
  durationHours: string;
  tags: string;
  outcomes: string;
  isPublished: boolean;
}

const fromCourse = (c: CourseDetail | null): Values => ({
  title: c?.title ?? '',
  description: c?.description ?? '',
  categoryName: c?.category_name ?? 'General',
  newCategory: '',
  durationHours: c?.duration_hours ? String(c.duration_hours) : '',
  tags: (c?.tags ?? []).join(', '),
  outcomes: (c?.outcomes ?? []).join('\n'),
  isPublished: Boolean(c?.is_published),
});

const sameValues = (a: Values, b: Values) => (Object.keys(a) as (keyof Values)[]).every((k) => a[k] === b[k]);

// Local drafts: typing is saved in this browser every moment, so closing the tab,
// a crash or an expired session never loses work. Cleared after a successful save.
const draftKey = (courseId: string | null) => `admin-web:draft:course:${courseId ?? 'new'}`;
interface StoredDraft {
  values: Values;
  savedAt: number;
}
const readDraft = (courseId: string | null): StoredDraft | null => {
  try {
    const raw = localStorage.getItem(draftKey(courseId));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
};

interface Props {
  course: CourseDetail | null; // null = creating a new course
  categories: Category[];
  onSaved: (courseId: string, created: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export const CourseDetailsForm: React.FC<Props> = ({ course, categories, onSaved, onDirtyChange }) => {
  const courseId = course?.id ?? null;
  const original = useMemo(() => fromCourse(course), [course]);
  const [values, setValues] = useState<Values>(original);
  const [offerDraft, setOfferDraft] = useState<StoredDraft | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(course?.thumbnail_url ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingUpload = useRef<string | null>(null); // uploaded but not yet saved on the course
  const abortRef = useRef<AbortController | null>(null);

  // Reset when the course changes (e.g. after creating, or reloading).
  useEffect(() => {
    setValues(original);
    setThumbnailUrl(course?.thumbnail_url ?? null);
    const draft = readDraft(courseId);
    setOfferDraft(draft && !sameValues(draft.values, original) ? draft : null);
  }, [original, course, courseId]);

  // Clean up an uploaded-but-never-saved cover if the user leaves.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (pendingUpload.current) void deleteOwnUpload(pendingUpload.current, 'course');
    },
    []
  );

  const coverChanged = thumbnailUrl !== (course?.thumbnail_url ?? null);
  const dirty = !sameValues(values, original) || coverChanged;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedWarning(dirty);

  // Save the draft locally (text fields only) shortly after each change.
  useEffect(() => {
    if (sameValues(values, original)) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(courseId), JSON.stringify({ values, savedAt: Date.now() }));
      } catch {
        // storage full or blocked: drafts are a convenience, not required
      }
    }, 400);
    return () => clearTimeout(t);
  }, [values, original, courseId]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const categoryName = values.categoryName === NEW_CATEGORY ? values.newCategory.trim() : values.categoryName;
  const durationNum = values.durationHours.trim() === '' ? 0 : Number(values.durationHours);
  const errors = {
    title: !values.title.trim()
      ? 'Please enter a course title.'
      : values.title.trim().length > TITLE_MAX
      ? `Keep the title under ${TITLE_MAX} characters.`
      : null,
    category: values.categoryName === NEW_CATEGORY && !categoryName ? 'Type a name for the new category.' : null,
    duration: Number.isNaN(durationNum) || durationNum < 0 ? 'Enter a number of hours, e.g. 1.5' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose a picture file (JPG or PNG).');
      return;
    }
    setError(null);
    const preview = URL.createObjectURL(file);
    setCoverPreview(preview);
    abortRef.current = new AbortController();
    setUploadProgress(0);
    try {
      const url = await uploadImage(file, 'course', { onProgress: setUploadProgress, signal: abortRef.current.signal });
      if (pendingUpload.current) void deleteOwnUpload(pendingUpload.current, 'course'); // superseded
      pendingUpload.current = url;
      setThumbnailUrl(url);
    } catch (err) {
      setCoverPreview(null);
      if (!(err instanceof UploadCancelledError)) setError(getErrorMessage(err));
    } finally {
      URL.revokeObjectURL(preview);
      abortRef.current = null;
      setUploadProgress(null);
    }
  };

  const removeCover = () => {
    if (pendingUpload.current) {
      void deleteOwnUpload(pendingUpload.current, 'course');
      pendingUpload.current = null;
    }
    setCoverPreview(null);
    setThumbnailUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || uploadProgress !== null || hasErrors) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const outcomes = values.outcomes.split('\n').map((s) => s.trim()).filter(Boolean);
    const input: CourseInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      categoryName: categoryName || 'General',
      durationHours: durationNum,
      thumbnailUrl,
      tags: values.tags.split(',').map((t) => t.trim()).filter(Boolean),
      isPublished: values.isPublished,
    };

    let savedId = courseId;
    try {
      if (courseId) {
        await updateCourse(courseId, input);
      } else {
        const created = await createCourse(input);
        savedId = String(created.id);
      }
      pendingUpload.current = null; // the cover now belongs to the course
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
      return;
    }

    // Outcomes are a separate call; report it honestly if only this part fails.
    const outcomesChanged = values.outcomes !== original.outcomes;
    if (savedId && (outcomesChanged || (!courseId && outcomes.length > 0))) {
      try {
        await setCourseOutcomes(savedId, outcomes);
      } catch (err) {
        setError(`The course was saved, but the learning outcomes were not: ${getErrorMessage(err)} Click Save again to retry.`);
        setSaving(false);
        if (!courseId && savedId) onSaved(savedId, true);
        return;
      }
    }

    try {
      localStorage.removeItem(draftKey(courseId));
    } catch {
      /* ignore */
    }
    setSaving(false);
    setCoverPreview(null);
    setNotice(courseId ? 'Changes saved.' : null);
    if (savedId) onSaved(savedId, !courseId);
  };

  const show = (msg: string | null) => (touched && msg ? <p style={errorText}>{msg}</p> : null);
  const lessonCount = (course?.modules ?? []).reduce((n, s) => n + s.videos.length + s.resources.length + s.quizzes.length, 0);
  const categoryOptions = Array.from(new Set(['General', ...categories.map((c) => c.name), original.categoryName].filter(Boolean)));

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: '18px' }}>
      {offerDraft && (
        <Alert kind="info">
          You have unsaved changes from {new Date(offerDraft.savedAt).toLocaleString()}.{' '}
          <button
            type="button"
            onClick={() => {
              setValues(offerDraft.values);
              setOfferDraft(null);
            }}
            style={{ ...btn('ghost'), color: '#1d4ed8', textDecoration: 'underline' }}
          >
            Restore them
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(draftKey(courseId));
              setOfferDraft(null);
            }}
            style={{ ...btn('ghost'), color: '#1d4ed8', textDecoration: 'underline' }}
          >
            Discard
          </button>
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '24px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label htmlFor="course-title" style={labelStyle}>
              Course title
            </label>
            <input
              id="course-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. 新约概论 Introduction to the New Testament"
              style={inputStyle}
              disabled={saving}
            />
            {show(errors.title)}
          </div>

          <div>
            <label htmlFor="course-desc" style={labelStyle}>
              Description
            </label>
            <textarea
              id="course-desc"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={5}
              placeholder="What is this course about, and who is it for?"
              style={{ ...inputStyle, resize: 'vertical' }}
              disabled={saving}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label htmlFor="course-category" style={labelStyle}>
                Category
              </label>
              <select
                id="course-category"
                value={values.categoryName}
                onChange={(e) => set('categoryName', e.target.value)}
                style={inputStyle}
                disabled={saving}
              >
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ New category…</option>
              </select>
              {values.categoryName === NEW_CATEGORY && (
                <input
                  aria-label="New category name"
                  value={values.newCategory}
                  onChange={(e) => set('newCategory', e.target.value)}
                  placeholder="Category name"
                  style={{ ...inputStyle, marginTop: '8px' }}
                  disabled={saving}
                />
              )}
              {show(errors.category)}
            </div>
            <div>
              <label htmlFor="course-duration" style={labelStyle}>
                Length (hours)
              </label>
              <input
                id="course-duration"
                type="number"
                min="0"
                step="0.5"
                value={values.durationHours}
                onChange={(e) => set('durationHours', e.target.value)}
                placeholder="e.g. 2"
                style={inputStyle}
                disabled={saving}
              />
              {show(errors.duration)}
            </div>
          </div>

          <div>
            <label htmlFor="course-tags" style={labelStyle}>
              Tags <span style={{ fontWeight: 400, ...muted }}>(separate with commas)</span>
            </label>
            <input
              id="course-tags"
              value={values.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="e.g. Bible, beginners, 圣经"
              style={inputStyle}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="course-outcomes" style={labelStyle}>
              What learners will gain <span style={{ fontWeight: 400, ...muted }}>(one per line)</span>
            </label>
            <textarea
              id="course-outcomes"
              value={values.outcomes}
              onChange={(e) => set('outcomes', e.target.value)}
              rows={4}
              placeholder={'Understand the structure of the New Testament\nRead the Gospels with confidence'}
              style={{ ...inputStyle, resize: 'vertical' }}
              disabled={saving}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <span style={labelStyle}>Cover picture</span>
            <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', overflow: 'hidden' }}>
              <CoverImage storedUrl={thumbnailUrl} localPreview={coverPreview} alt="Course cover" style={{ width: '100%', height: '140px', display: 'block' }} />
            </div>
            {uploadProgress !== null ? (
              <div style={{ marginTop: '8px' }}>
                <div style={{ height: '6px', background: 'var(--table-header-bg, #e2e8f0)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#16a34a' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={muted}>Uploading… {uploadProgress}%</span>
                  <button type="button" onClick={() => abortRef.current?.abort()} style={btn('ghost')}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                <label style={{ ...btn('secondary', saving), display: 'inline-block' }}>
                  {thumbnailUrl ? 'Change picture' : 'Choose picture'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCover} disabled={saving} style={{ display: 'none' }} />
                </label>
                {thumbnailUrl && (
                  <button type="button" onClick={removeCover} disabled={saving} style={btn('ghost', saving)}>
                    Remove
                  </button>
                )}
              </div>
            )}
            <p style={{ ...muted, fontSize: '12px' }}>A wide picture works best (about 2:1).</p>
          </div>

          <div style={{ ...card, padding: '14px' }}>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={values.isPublished} onChange={(e) => set('isPublished', e.target.checked)} disabled={saving} style={{ marginTop: '3px' }} />
              <span>
                <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '14px' }}>Published</strong>
                <span style={{ ...muted, display: 'block' }}>
                  {values.isPublished ? 'Members can find and enrol in this course.' : 'Draft: only instructors and administrators can see it.'}
                </span>
              </span>
            </label>
            {values.isPublished && course && lessonCount === 0 && (
              <p style={{ ...muted, color: '#b45309', margin: '8px 0 0' }}>This course has no lessons yet, so members will see an empty course.</p>
            )}
          </div>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && !dirty && <Alert kind="success">{notice}</Alert>}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button type="submit" disabled={saving || uploadProgress !== null} style={btn('primary', saving || uploadProgress !== null)}>
          {saving ? 'Saving…' : courseId ? 'Save changes' : 'Create course'}
        </button>
        {dirty && !saving && <span style={muted}>Unsaved changes. A draft is kept in this browser.</span>}
      </div>
    </form>
  );
};