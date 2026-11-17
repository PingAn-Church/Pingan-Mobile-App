import React, { useMemo, useState } from 'react';
import { createQuestion, getErrorMessage, MatchingPair, QuestionInput, QuestionType, QuizQuestionView, updateQuestion } from '../api';
import { Alert, btn, errorText, inputStyle, labelStyle, Modal, muted } from './ui';

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: 'multiple-choice', label: 'Multiple choice (one answer)', hint: 'Learners pick one option.' },
  { value: 'multiple-correct', label: 'Multiple choice (several answers)', hint: 'Learners tick every correct option. All must be right to score.' },
  { value: 'true-false', label: 'True / False', hint: 'Learners choose True or False.' },
  { value: 'short-answer', label: 'Short answer', hint: 'Learners type an answer. An instructor reviews it in the grading queue.' },
  { value: 'matching', label: 'Matching pairs', hint: 'Learners match each item on the left with one on the right.' },
];

export const typeLabel = (t: QuestionType) => QUESTION_TYPES.find((q) => q.value === t)?.label ?? t;

const usesOptions = (t: QuestionType) => t === 'multiple-choice' || t === 'multiple-correct';

interface Props {
  quizId: string;
  question: QuizQuestionView | null; // null = new question
  nextOrder: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export const QuestionForm: React.FC<Props> = ({ quizId, question, nextOrder, onClose, onSaved }) => {
  const editing = Boolean(question);
  const [type, setType] = useState<QuestionType>(question?.question_type ?? 'multiple-choice');
  const [text, setText] = useState(question?.question ?? '');
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [explanation, setExplanation] = useState('');
  // The server never returns correct answers, so on an existing question the
  // answer is only sent when the instructor deliberately re-chooses it.
  const [changeAnswer, setChangeAnswer] = useState(!editing);
  const [options, setOptions] = useState<string[]>(
    question && usesOptions(question.question_type) && question.options?.length ? question.options : ['', '', '']
  );
  const [single, setSingle] = useState<number | null>(null);
  const [multi, setMulti] = useState<Set<number>>(new Set());
  const [tf, setTf] = useState<'True' | 'False' | null>(null);
  const [expected, setExpected] = useState('');
  const [pairs, setPairs] = useState<MatchingPair[]>(
    question?.question_type === 'matching' && question.matching_left?.length
      ? question.matching_left.map((left) => ({ left, right: '' }))
      : [
          { left: '', right: '' },
          { left: '', right: '' },
        ]
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeChanged = editing && type !== question?.question_type;
  const sendAnswer = changeAnswer || typeChanged;

  const changeType = (next: QuestionType) => {
    setType(next);
    setSingle(null);
    setMulti(new Set());
    setTf(null);
  };

  // Options: trimmed, empty rows ignored. Indexes refer to the visible rows.
  const filled = options.map((o, i) => ({ text: o.trim(), i })).filter((o) => o.text);
  const pointsNum = Number(points);

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {
      text: !text.trim() ? 'Please type the question.' : null,
      points: !Number.isInteger(pointsNum) || pointsNum < 1 || pointsNum > 100 ? 'Points must be a whole number from 1 to 100.' : null,
      answer: null,
    };
    if (!sendAnswer) return e;
    if (usesOptions(type)) {
      const texts = filled.map((o) => o.text);
      if (texts.length < 2) e.answer = 'Add at least two options.';
      else if (new Set(texts).size !== texts.length) e.answer = 'Two options have the same text. Make each option different.';
      else if (type === 'multiple-choice' && (single === null || !options[single]?.trim())) e.answer = 'Choose which option is correct.';
      else if (type === 'multiple-correct' && !Array.from(multi).some((i) => options[i]?.trim())) e.answer = 'Tick at least one correct option.';
    } else if (type === 'true-false') {
      if (!tf) e.answer = 'Choose True or False as the correct answer.';
    } else if (type === 'short-answer') {
      if (!expected.trim()) e.answer = 'Type the expected answer (instructors see it when grading).';
    } else if (type === 'matching') {
      const complete = pairs.filter((p) => p.left.trim() && p.right.trim());
      const partial = pairs.some((p) => Boolean(p.left.trim()) !== Boolean(p.right.trim()));
      const lefts = complete.map((p) => p.left.trim());
      if (partial) e.answer = 'Every pair needs both a left and a right item (or clear the row).';
      else if (complete.length < 2) e.answer = 'Add at least two pairs.';
      else if (new Set(lefts).size !== lefts.length) e.answer = 'Each left-hand item must be different.';
    }
    return e;
  }, [text, pointsNum, sendAnswer, type, filled, options, single, multi, tf, expected, pairs]);

  const hasErrors = Object.values(errors).some(Boolean);

  const buildAnswer = (): Pick<QuestionInput, 'options' | 'correctAnswer'> => {
    switch (type) {
      case 'multiple-choice':
        return { options: filled.map((o) => o.text), correctAnswer: options[single as number].trim() };
      case 'multiple-correct':
        return { options: filled.map((o) => o.text), correctAnswer: filled.filter((o) => multi.has(o.i)).map((o) => o.text) };
      case 'true-false':
        return { options: ['True', 'False'], correctAnswer: tf as string };
      case 'short-answer':
        return { options: [], correctAnswer: expected.trim() };
      case 'matching':
        return {
          options: [],
          correctAnswer: pairs.filter((p) => p.left.trim() && p.right.trim()).map((p) => ({ left: p.left.trim(), right: p.right.trim() })),
        };
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (saving || hasErrors) return;
    setSaving(true);
    setError(null);
    try {
      const base: Partial<QuestionInput> = { question: text.trim(), points: pointsNum };
      if (explanation.trim() || !editing) base.explanation = explanation.trim();
      if (sendAnswer) Object.assign(base, { questionType: type }, buildAnswer());
      if (question) await updateQuestion(question.id, base);
      else await createQuestion({ ...(base as QuestionInput), quizId, questionType: type, orderIndex: nextOrder });
      await onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const show = (msg: string | null) => (touched && msg ? <p style={errorText}>{msg}</p> : null);

  return (
    <Modal title={editing ? 'Edit question' : 'Add a question'} onClose={onClose} busy={saving} width={860}>
      <form onSubmit={save} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '24px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label htmlFor="q-type" style={labelStyle}>
                Question type
              </label>
              <select id="q-type" value={type} onChange={(e) => changeType(e.target.value as QuestionType)} style={inputStyle} disabled={saving}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p style={{ ...muted, fontSize: '12px', margin: '4px 0 0' }}>{QUESTION_TYPES.find((t) => t.value === type)?.hint}</p>
            </div>

            <div>
              <label htmlFor="q-text" style={labelStyle}>
                Question
              </label>
              <textarea id="q-text" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} disabled={saving} />
              {show(errors.text)}
            </div>

            <div>
              <label htmlFor="q-points" style={labelStyle}>
                Points
              </label>
              <input id="q-points" type="number" min="1" max="100" value={points} onChange={(e) => setPoints(e.target.value)} style={{ ...inputStyle, width: '120px' }} disabled={saving} />
              {show(errors.points)}
            </div>

            {editing && !typeChanged && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>
                <input type="checkbox" checked={changeAnswer} onChange={(e) => setChangeAnswer(e.target.checked)} disabled={saving} style={{ marginTop: '3px' }} />
                <span>
                  Change the options or correct answer
                  <span style={{ ...muted, display: 'block' }}>
                    For learners' privacy the server never shows saved answers, so you'll choose the correct answer again.
                  </span>
                </span>
              </label>
            )}
            {typeChanged && <Alert kind="info">You changed the question type, so please set up the answer again.</Alert>}

            {sendAnswer && (
              <fieldset style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '14px', margin: 0 }}>
                <legend style={{ ...labelStyle, padding: '0 6px', marginBottom: 0 }}>Answer</legend>

                {usesOptions(type) && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <p style={{ ...muted, margin: 0 }}>{type === 'multiple-choice' ? 'Select the one correct option.' : 'Tick every correct option.'}</p>
                    {options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {type === 'multiple-choice' ? (
                          <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={single === i} onChange={() => setSingle(i)} disabled={saving} />
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`Option ${i + 1} is correct`}
                            checked={multi.has(i)}
                            onChange={() =>
                              setMulti((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              })
                            }
                            disabled={saving}
                          />
                        )}
                        <input
                          aria-label={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                          placeholder={`Option ${i + 1}`}
                          style={inputStyle}
                          disabled={saving}
                        />
                        <button
                          type="button"
                          aria-label={`Remove option ${i + 1}`}
                          disabled={saving || options.length <= 2}
                          onClick={() => {
                            setOptions((prev) => prev.filter((_, j) => j !== i));
                            setSingle((s) => (s === null || s === i ? null : s > i ? s - 1 : s));
                            setMulti((prev) => new Set(Array.from(prev).filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))));
                          }}
                          style={btn('ghost', saving || options.length <= 2)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {options.length < 8 && (
                      <button type="button" onClick={() => setOptions((prev) => [...prev, ''])} disabled={saving} style={{ ...btn('secondary', saving), justifySelf: 'start' }}>
                        + Add option
                      </button>
                    )}
                  </div>
                )}

                {type === 'true-false' && (
                  <div style={{ display: 'flex', gap: '20px' }}>
                    {(['True', 'False'] as const).map((v) => (
                      <label key={v} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>
                        <input type="radio" name="tf" checked={tf === v} onChange={() => setTf(v)} disabled={saving} />
                        {v} is correct
                      </label>
                    ))}
                  </div>
                )}

                {type === 'short-answer' && (
                  <div>
                    <label htmlFor="q-expected" style={labelStyle}>
                      Expected answer
                    </label>
                    <input id="q-expected" value={expected} onChange={(e) => setExpected(e.target.value)} style={inputStyle} disabled={saving} />
                    <p style={{ ...muted, fontSize: '12px', margin: '4px 0 0' }}>
                      Short answers are marked by an instructor in the grading queue; this is shown to them as a guide.
                    </p>
                  </div>
                )}

                {type === 'matching' && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <p style={{ ...muted, margin: 0 }}>Write each correct pair. Learners will see the right-hand items shuffled.</p>
                    {pairs.map((p, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '8px', alignItems: 'center' }}>
                        <input
                          aria-label={`Pair ${i + 1} left`}
                          value={p.left}
                          onChange={(e) => setPairs((prev) => prev.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)))}
                          placeholder="e.g. Genesis"
                          style={inputStyle}
                          disabled={saving}
                        />
                        <span aria-hidden style={muted}>
                          →
                        </span>
                        <input
                          aria-label={`Pair ${i + 1} right`}
                          value={p.right}
                          onChange={(e) => setPairs((prev) => prev.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)))}
                          placeholder="e.g. Creation"
                          style={inputStyle}
                          disabled={saving}
                        />
                        <button
                          type="button"
                          aria-label={`Remove pair ${i + 1}`}
                          disabled={saving || pairs.length <= 2}
                          onClick={() => setPairs((prev) => prev.filter((_, j) => j !== i))}
                          style={btn('ghost', saving || pairs.length <= 2)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {pairs.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setPairs((prev) => [...prev, { left: '', right: '' }])}
                        disabled={saving}
                        style={{ ...btn('secondary', saving), justifySelf: 'start' }}
                      >
                        + Add pair
                      </button>
                    )}
                  </div>
                )}
                {show(errors.answer)}
              </fieldset>
            )}

            <div>
              <label htmlFor="q-explanation" style={labelStyle}>
                Explanation <span style={{ fontWeight: 400, ...muted }}>(optional, shown to learners after they answer)</span>
              </label>
              <textarea
                id="q-explanation"
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={editing ? 'Leave empty to keep the current explanation' : ''}
                style={{ ...inputStyle, resize: 'vertical' }}
                disabled={saving}
              />
            </div>
          </div>

          <LearnerPreview
            type={type}
            text={text}
            options={usesOptions(type) ? filled.map((o) => o.text) : []}
            lefts={pairs.map((p) => p.left.trim()).filter(Boolean)}
            rights={pairs.map((p) => p.right.trim()).filter(Boolean)}
          />
        </div>

        {error && (
          <div style={{ marginTop: '14px' }}>
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn('secondary', saving)}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={btn('primary', saving)}>
            {saving ? 'Saving…' : editing ? 'Save question' : 'Add question'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// What the learner will see (no answers revealed)
// ---------------------------------------------------------------------------
const LearnerPreview: React.FC<{ type: QuestionType; text: string; options: string[]; lefts: string[]; rights: string[] }> = ({
  type,
  text,
  options,
  lefts,
  rights,
}) => {
  const shuffled = useMemo(() => [...rights].sort((a, b) => a.localeCompare(b)), [rights]);
  const row: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, #e2e8f0)',
    fontSize: '13px',
    color: 'var(--text-primary, #0f172a)',
  };
  return (
    <div aria-label="Learner preview">
      <span style={labelStyle}>What learners see</span>
      <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '14px', padding: '14px', background: 'var(--bg-main, #f8fafc)', display: 'grid', gap: '8px' }}>
        <strong style={{ fontSize: '14px', color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{text.trim() || 'Your question appears here'}</strong>
        {(type === 'multiple-choice' || type === 'multiple-correct') &&
          (options.length ? options : ['Option 1', 'Option 2']).map((o, i) => (
            <div key={i} style={row}>
              <span aria-hidden>{type === 'multiple-choice' ? '○' : '☐'}</span>
              {o}
            </div>
          ))}
        {type === 'true-false' &&
          ['True', 'False'].map((o) => (
            <div key={o} style={row}>
              <span aria-hidden>○</span>
              {o}
            </div>
          ))}
        {type === 'short-answer' && <div style={{ ...row, color: 'var(--text-secondary, #94a3b8)' }}>Type your answer…</div>}
        {type === 'matching' &&
          (lefts.length ? lefts : ['Item 1', 'Item 2']).map((l, i) => (
            <div key={i} style={{ ...row, justifyContent: 'space-between' }}>
              <span>{l}</span>
              <span style={{ ...muted, fontSize: '12px' }}>▾ {shuffled.length ? 'choose…' : 'match'}</span>
            </div>
          ))}
        {type === 'matching' && shuffled.length > 0 && <p style={{ ...muted, fontSize: '12px', margin: 0 }}>Choices: {shuffled.join(' · ')}</p>}
      </div>
    </div>
  );
};
