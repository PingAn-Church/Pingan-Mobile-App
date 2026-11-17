import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { CourseContent } from './CourseContent';
import { QuizQuestionsModal } from './QuizEditor';
import * as api from '../api';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  const m: any = { ...actual };
  ['getQuizDetail', 'createQuiz', 'updateQuiz', 'deleteQuiz', 'createQuestion', 'updateQuestion', 'deleteQuestion'].forEach((f) => (m[f] = jest.fn()));
  return m;
});
const A = api as jest.Mocked<typeof api>;

const emptyQuiz = { id: 'q1', course_id: '7', section_id: 's1', title: 'Week 1 check', passing_score: 70, time_limit_minutes: null, max_attempts: 3, questions: [] as any[] };

beforeEach(() => {
  jest.clearAllMocks();
  A.getQuizDetail.mockResolvedValue(emptyQuiz as any);
  A.createQuestion.mockResolvedValue({});
  A.updateQuestion.mockResolvedValue({});
});

const openAdd = async () => {
  render(<QuizQuestionsModal quizId="q1" onClose={() => {}} onChanged={() => {}} />);
  fireEvent.click(await screen.findByText('+ Add question'));
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Which book comes first?' } });
};
const submit = () => fireEvent.click(screen.getByText('Add question'));

test('multiple choice: requires a correct pick; sends exact option text, empty rows dropped', async () => {
  await openAdd();
  fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: ' Genesis ' } });
  fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Exodus' } });
  submit();
  expect(await screen.findByText('Choose which option is correct.')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Option 1 is correct'));
  submit();
  await waitFor(() => expect(A.createQuestion).toHaveBeenCalled());
  expect(A.createQuestion).toHaveBeenCalledWith(expect.objectContaining({
    quizId: 'q1', questionType: 'multiple-choice', options: ['Genesis', 'Exodus'], correctAnswer: 'Genesis', points: 1, orderIndex: 0,
  }));
});

test('duplicate options are rejected', async () => {
  await openAdd();
  fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'A' } });
  fireEvent.click(screen.getByLabelText('Option 1 is correct'));
  submit();
  expect(await screen.findByText(/same text/)).toBeTruthy();
  expect(A.createQuestion).not.toHaveBeenCalled();
});

test('several answers: list of option texts', async () => {
  await openAdd();
  fireEvent.change(screen.getByLabelText('Question type'), { target: { value: 'multiple-correct' } });
  ['Matthew', 'Psalms', 'John'].forEach((v, i) => fireEvent.change(screen.getByLabelText(`Option ${i + 1}`), { target: { value: v } }));
  fireEvent.click(screen.getByLabelText('Option 1 is correct'));
  fireEvent.click(screen.getByLabelText('Option 3 is correct'));
  submit();
  await waitFor(() => expect(A.createQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionType: 'multiple-correct', correctAnswer: ['Matthew', 'John'] })));
});

test('true/false and short answer formats', async () => {
  await openAdd();
  fireEvent.change(screen.getByLabelText('Question type'), { target: { value: 'true-false' } });
  fireEvent.click(screen.getByLabelText('False is correct'));
  submit();
  await waitFor(() => expect(A.createQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionType: 'true-false', options: ['True', 'False'], correctAnswer: 'False' })));
});

test('matching: partial pair rejected, pairs sent', async () => {
  await openAdd();
  fireEvent.change(screen.getByLabelText('Question type'), { target: { value: 'matching' } });
  fireEvent.change(screen.getByLabelText('Pair 1 left'), { target: { value: 'Genesis' } });
  fireEvent.change(screen.getByLabelText('Pair 1 right'), { target: { value: 'Creation' } });
  fireEvent.change(screen.getByLabelText('Pair 2 left'), { target: { value: 'Exodus' } });
  submit();
  expect(await screen.findByText(/needs both a left and a right/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Pair 2 right'), { target: { value: 'Leaving Egypt' } });
  submit();
  await waitFor(() => expect(A.createQuestion).toHaveBeenCalledWith(expect.objectContaining({
    questionType: 'matching', correctAnswer: [{ left: 'Genesis', right: 'Creation' }, { left: 'Exodus', right: 'Leaving Egypt' }],
  })));
});

test('editing wording only never touches the saved answer', async () => {
  A.getQuizDetail.mockResolvedValue({ ...emptyQuiz, questions: [{ id: 'x1', question: 'Old?', question_type: 'multiple-choice', options: ['A', 'B'], points: 2, order_index: 0 }] } as any);
  render(<QuizQuestionsModal quizId="q1" onClose={() => {}} onChanged={() => {}} />);
  fireEvent.click(await screen.findByText('Edit'));
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'New wording?' } });
  fireEvent.click(screen.getByText('Save question'));
  await waitFor(() => expect(A.updateQuestion).toHaveBeenCalledWith('x1', { question: 'New wording?', points: 2 }));
});

test('Escape closes only the top dialog', async () => {
  const onClose = jest.fn();
  render(<QuizQuestionsModal quizId="q1" onClose={onClose} onChanged={() => {}} />);
  fireEvent.click(await screen.findByText('+ Add question'));
  expect(screen.getByText('Add a question')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByText('Add a question')).toBeNull());
  expect(onClose).not.toHaveBeenCalled();
});

test('creating a quiz opens its questions; deleting warns about scores', async () => {
  A.createQuiz.mockResolvedValue({ id: 'q9' });
  A.deleteQuiz.mockResolvedValue();
  const course: any = { id: '7', title: 'C', is_published: false, outcomes: [], modules: [
    { id: 's1', title: 'Week 1', order_index: 0, videos: [], resources: [], quizzes: [{ id: 'q1', type: 'quiz', section_id: 's1', title: 'Old quiz', order_index: 0 }] },
  ] };
  const reload = jest.fn().mockResolvedValue(undefined);
  render(<CourseContent course={course} reload={reload} />);
  fireEvent.click(screen.getByText('+ Quiz'));
  fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'New quiz' } });
  fireEvent.change(screen.getByLabelText('Attempts allowed'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Create quiz and add questions'));
  await waitFor(() => expect(A.createQuiz).toHaveBeenCalledWith(expect.objectContaining({ courseId: '7', sectionId: 's1', title: 'New quiz', passingScore: 70, maxAttempts: null, timeLimitMinutes: null, orderIndex: 1 })));
  expect(await screen.findByText('+ Add question')).toBeTruthy();
  fireEvent.click(screen.getByText('Done'));
  fireEvent.click(screen.getAllByText('Delete').find((b) => b.closest('div')?.textContent?.includes('Old quiz'))!);
  expect(within(screen.getByRole('dialog')).getByText(/every learner's attempts and scores/)).toBeTruthy();
});
