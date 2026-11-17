import React, { useCallback, useEffect, useState } from 'react';
import { createQuiz, deleteQuestion, getErrorMessage, getQuizDetail, QuizDetail, QuizLesson, QuizQuestionView, updateQuestion, updateQuiz } from '../api';
import { QuestionForm, typeLabel } from './QuestionForm';
import { Alert, btn, card, ConfirmDialog, errorText, inputStyle, labelStyle, Modal, muted } from './ui';

// ---------------------------------------------------------------------------
// Quiz settings: create or edit
// ---------------------------------------------------------------------------
export const QuizSettingsModal: React.FC<{
  courseId: string;
  sectionId: string;
  quiz: QuizLesson | null; // null = new quiz
  nextOrder: number;
  onClose: () => void;
  onSaved: (quizId: string | null) => Promise<void>;
}> = ({ courseId, sectionId, quiz, nextOrder, onClose, onSaved }) => {
  const [loading, setLoading] = useState(Boolean(quiz));
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [description, setDescription] = useState(quiz?.description ?? '');
  const [passing, setPassing] = useState(String(quiz?.passing_score ?? 70));
  const [timeLimit, setTimeLimit] = useState('');
  const [attempts, setAttempts] = useState(quiz ? (quiz.max_attempts ? String(quiz.max_attempts) : '') : '3');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The lesson list doesn't include the time limit, so read the full quiz.
  useEffect(() => {
    if (!quiz) return;
    getQuizDetail(quiz.id)
      .then((d) => {
        setDescription(d.description ?? '');
        setTimeLimit(d.time_limit_minutes ? String(d.time_limit_minutes) : '');
        setAttempts(d.max_attempts ? String(d.max_attempts) : '');
      })
      .catch((err) => setError(`Could not load all quiz settings: ${getErrorMessage(err)}`))
      .finally(() => setLoading(false));
  }, [quiz]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const passingNum = Number(passing);
  const timeNum = num(timeLimit);
  const attemptsNum = num(attempts);
  const errors = {
    title: !title.trim() ? 'Please enter a quiz title.' : null,
    passing: !Number.isInteger(passingNum) || passingNum < 0 || passingNum > 100 ? 'Pass mark must be a whole number from 0 to 100.' : null,
    time: timeNum !== null && (!Number.isInteger(timeNum) || timeNum < 1) ? 'Enter whole minutes, or leave empty for no limit.' : null,
    attempts: attemptsNum !== null && (!Number.isInteger(attemptsNum) || attemptsNum < 1) ? 'Enter a whole number, or leave empty for unlimited.' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || loading || hasErrors) return;
    setSaving(true);
    setError(null);
    const body = {
      courseId,
      sectionId,
      title: title.trim(),
      description: description.trim(),
      passingScore: passingNum,
      timeLimitMinutes: timeNum,
      maxAttempts: attemptsNum,
    };
    try {
      if (quiz) {
        await updateQuiz(quiz.id, body);
        await onSaved(null);
      } else {
        const created = await createQuiz({ ...body, orderIndex: nextOrder });
        await onSaved(created?.id ? String(created.id) : null);
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const show = (msg: string | null) => (touched && msg ? <p style={errorText}>{msg}</p> : null);
  const busy = saving || loading;

  return (
    <Modal title={quiz ? 'Quiz settings' : 'Add a quiz'} onClose={onClose} busy={saving}>
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label htmlFor="quiz-title" style={labelStyle}>
            Quiz title
          </label>
          <input id="quiz-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1 check 第一周小测" style={inputStyle} disabled={busy} />
          {show(errors.title)}
        </div>
        <div>
          <label htmlFor="quiz-desc" style={labelStyle}>
            Instructions <span style={{ fontWeight: 400, ...muted }}>(optional)</span>
          </label>
          <textarea id="quiz-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} disabled={busy} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div>
            <label htmlFor="quiz-pass" style={labelStyle}>
              Pass mark (%)
            </label>
            <input id="quiz-pass" type="number" min="0" max="100" value={passing} onChange={(e) => setPassing(e.target.value)} style={inputStyle} disabled={busy} />
            {show(errors.passing)}
          </div>
          <div>
            <label htmlFor="quiz-time" style={labelStyle}>
              Time limit (min)
            </label>
            <input id="quiz-time" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="No limit" style={inputStyle} disabled={busy} />
            {show(errors.time)}
          </div>
          <div>
            <label htmlFor="quiz-attempts" style={labelStyle}>
              Attempts allowed
            </label>
            <input id="quiz-attempts" type="number" min="1" value={attempts} onChange={(e) => setAttempts(e.target.value)} placeholder="Unlimited" style={inputStyle} disabled={busy} />
            {show(errors.attempts)}
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn('secondary', saving)}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={btn('primary', busy)}>
            {saving ? 'Saving…' : quiz ? 'Save settings' : 'Create quiz and add questions'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Questions for one quiz
// ---------------------------------------------------------------------------
export const QuizQuestionsModal: React.FC<{ quizId: string; onClose: () => void; onChanged: () => void }> = ({ quizId, onClose, onChanged }) => {
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ question: QuizQuestionView | null } | null>(null);
  const [toDelete, setToDelete] = useState<QuizQuestionView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setQuiz(await getQuizDetail(quizId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = [...(quiz?.questions ?? [])].sort((a, b) => a.order_index - b.order_index);
  const totalPoints = questions.reduce((n, q) => n + (q.points ?? 1), 0);

  const afterChange = async () => {
    await load();
    onChanged();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (moving || target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMoving(true);
    setError(null);
    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order_index !== i) await updateQuestion(reordered[i].id, { orderIndex: i });
      }
    } catch (err) {
      setError(`Could not finish reordering: ${getErrorMessage(err)}`);
    } finally {
      await load();
      setMoving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteQuestion(toDelete.id);
      setToDelete(null);
      await afterChange();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal title={quiz ? `Questions: ${quiz.title}` : 'Questions'} onClose={onClose} width={760}>
      {loading && <p style={muted}>Loading questions…</p>}
      {!loading && error && !quiz && (
        <div>
          <Alert kind="error">Could not load this quiz. {error}</Alert>
          <button type="button" onClick={() => void load()} style={{ ...btn('secondary'), marginTop: '12px' }}>
            Try again
          </button>
        </div>
      )}

      {quiz && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={muted}>
              {questions.length} question{questions.length === 1 ? '' : 's'} · {totalPoints} point{totalPoints === 1 ? '' : 's'} · pass mark {quiz.passing_score}%
              {quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : ''}
              {quiz.max_attempts ? ` · ${quiz.max_attempts} attempts` : ' · unlimited attempts'}
            </span>
            <button type="button" onClick={() => setEditing({ question: null })} style={btn('primary')}>
              + Add question
            </button>
          </div>
          <p style={{ ...muted, fontSize: '12px', margin: 0 }}>
            Changes apply to future attempts; scores already given are not recalculated. Correct answers are hidden for learners' privacy. To change one,
            edit the question and choose it again.
          </p>
          {error && <Alert kind="error">{error}</Alert>}
          {moving && <p style={muted}>Saving new order…</p>}

          {questions.length === 0 && (
            <div style={{ ...card, textAlign: 'center', ...muted, fontSize: '14px' }}>No questions yet. Add the first one.</div>
          )}

          {questions.map((q, i) => (
            <div key={q.id} style={{ ...card, padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button type="button" aria-label={`Move question ${i + 1} up`} disabled={moving || i === 0} onClick={() => void move(i, -1)} style={btn('ghost', moving || i === 0)}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move question ${i + 1} down`}
                  disabled={moving || i === questions.length - 1}
                  onClick={() => void move(i, 1)}
                  style={btn('ghost', moving || i === questions.length - 1)}
                >
                  ▼
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...muted, fontSize: '12px' }}>
                  Q{i + 1} · {typeLabel(q.question_type)} · {q.points} pt{q.points === 1 ? '' : 's'}
                </span>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)', margin: '2px 0 4px', wordBreak: 'break-word' }}>{q.question}</div>
                {q.question_type === 'matching' && q.matching_left?.length ? (
                  <span style={{ ...muted, fontSize: '12px' }}>Pairs: {q.matching_left.join(' · ')}</span>
                ) : q.options?.length && q.question_type !== 'short-answer' ? (
                  <span style={{ ...muted, fontSize: '12px' }}>Options: {q.options.join(' · ')}</span>
                ) : null}
              </div>
              <button type="button" onClick={() => setEditing({ question: q })} style={btn('ghost')}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setToDelete(q);
                }}
                style={{ ...btn('ghost'), color: '#dc2626' }}
              >
                Delete
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btn('secondary')}>
              Done
            </button>
          </div>
        </div>
      )}

      {editing && quiz && (
        <QuestionForm quizId={quiz.id} question={editing.question} nextOrder={questions.length} onClose={() => setEditing(null)} onSaved={afterChange} />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete this question?"
          message={
            <p>
              <strong style={{ color: 'var(--text-primary, #0f172a)' }}>“{toDelete.question}”</strong> will be removed from the quiz. Scores already given are not changed.
            </p>
          }
          confirmLabel="Delete question"
          busy={deleting}
          error={deleteError}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </Modal>
  );
};
