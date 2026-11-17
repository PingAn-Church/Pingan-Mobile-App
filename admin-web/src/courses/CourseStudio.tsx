import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { CourseEditor } from '../CourseEditor';
import * as api from '../api';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  const fns = ['listCourses','getCourse','listCategories','createCourse','updateCourse','deleteCourse','setCourseOutcomes',
    'createSection','updateSection','deleteSection','createCourseVideo','updateCourseVideo','deleteCourseVideo',
    'createCourseResource','updateCourseResource','deleteCourseResource','resolveImageUrl','uploadImage','deleteOwnUpload'];
  const m: any = { ...actual };
  fns.forEach((f) => (m[f] = jest.fn()));
  return m;
});
const A = api as jest.Mocked<typeof api>;

const course = (over: any = {}) => ({
  id: '7', title: 'Intro 新约', description: '', category_name: 'General', is_published: false, tags: [], outcomes: [],
  thumbnail_url: null, student_count: 2, duration_hours: 0,
  modules: [
    { id: 's1', title: 'Week 1', order_index: 0, videos: [{ id: 'v1', type: 'video', section_id: 's1', title: 'Video A', order_index: 0 }], resources: [], quizzes: [{ id: 'q1', type: 'quiz', section_id: 's1', title: 'Quiz', order_index: 0 }] },
    { id: 's2', title: 'Week 2', order_index: 1, videos: [], resources: [], quizzes: [] },
  ],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  A.listCategories.mockResolvedValue([{ id: '1', name: 'Bible' }]);
  A.resolveImageUrl.mockResolvedValue(null);
  A.listCourses.mockResolvedValue({ courses: [{ id: '7', title: 'Intro 新约', is_published: false } as any], totalCount: 1, hasMore: false });
  A.getCourse.mockResolvedValue(course() as any);
});

test('create course validates, saves, then opens content tab', async () => {
  A.createCourse.mockResolvedValue({ id: '9', title: 'New one' } as any);
  A.setCourseOutcomes.mockResolvedValue();
  A.getCourse.mockResolvedValue(course({ id: '9', title: 'New one', modules: [] }) as any);
  render(<CourseEditor />);
  fireEvent.click(await screen.findByText('+ New course'));
  fireEvent.click(screen.getByText('Create course'));
  expect(await screen.findByText('Please enter a course title.')).toBeTruthy();
  expect(A.createCourse).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'New one' } });
  fireEvent.change(screen.getByLabelText(/What learners will gain/), { target: { value: 'A\n\nB' } });
  fireEvent.click(screen.getByText('Create course'));
  await screen.findByText('Course created. Now add sections and lessons.');
  expect(A.createCourse).toHaveBeenCalledWith(expect.objectContaining({ title: 'New one', categoryName: 'General', isPublished: false }));
  expect(A.setCourseOutcomes).toHaveBeenCalledWith('9', ['A', 'B']);
  expect(await screen.findByText(/No sections yet/)).toBeTruthy();
});

test('draft survives and can be restored', async () => {
  const first = render(<CourseEditor />);
  fireEvent.click(await screen.findByText('Intro 新约'));
  const title = await screen.findByLabelText('Course title');
  fireEvent.change(title, { target: { value: 'Edited title' } });
  await new Promise((r) => setTimeout(r, 500));
  first.unmount();
  render(<CourseEditor />);
  fireEvent.click(await screen.findByText('Intro 新约'));
  fireEvent.click(await screen.findByText('Restore them'));
  expect((screen.getByLabelText('Course title') as HTMLInputElement).value).toBe('Edited title');
});

test('section delete names contents; reorder sends clean indexes', async () => {
  A.updateSection.mockResolvedValue({});
  A.deleteSection.mockResolvedValue();
  render(<CourseEditor />);
  fireEvent.click(await screen.findByText('Intro 新约'));
  fireEvent.click(await screen.findByText(/Sections & lessons/));
  fireEvent.click(screen.getByLabelText('Move Week 2 up'));
  await waitFor(() => expect(A.updateSection).toHaveBeenCalledTimes(2));
  expect(A.updateSection).toHaveBeenCalledWith('s2', { orderIndex: 0 });
  expect(A.updateSection).toHaveBeenCalledWith('s1', { orderIndex: 1 });
  await waitFor(() => expect(screen.getAllByText('Delete')[0]).toBeTruthy());
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/1 video, 1 quiz/)).toBeTruthy();
  fireEvent.click(within(dialog).getByText('Delete section'));
  await waitFor(() => expect(A.deleteSection).toHaveBeenCalledWith('s1'));
});

test('lesson modal validates link and saves video', async () => {
  A.createCourseVideo.mockResolvedValue({});
  render(<CourseEditor />);
  fireEvent.click(await screen.findByText('Intro 新约'));
  fireEvent.click(await screen.findByText(/Sections & lessons/));
  fireEvent.click(screen.getAllByText('+ Video')[1]);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Lesson 1' } });
  fireEvent.change(screen.getByLabelText('Video link'), { target: { value: 'youtube' } });
  fireEvent.click(screen.getByText('Add lesson'));
  expect(await screen.findByText(/must start with http/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Video link'), { target: { value: 'https://youtu.be/x' } });
  fireEvent.change(screen.getByLabelText('Length (minutes)'), { target: { value: '12' } });
  fireEvent.click(screen.getByText('Add lesson'));
  await waitFor(() => expect(A.createCourseVideo).toHaveBeenCalledWith(expect.objectContaining({ courseId: '7', sectionId: 's2', durationSeconds: 720, orderIndex: 0 })));
});

test('delete course warns about enrolled members', async () => {
  A.deleteCourse.mockResolvedValue();
  render(<CourseEditor />);
  fireEvent.click(await screen.findByText('Intro 新约'));
  fireEvent.click(await screen.findByText('Delete course…'));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/2 members are enrolled/)).toBeTruthy();
  fireEvent.click(within(dialog).getByText('Delete course'));
  await screen.findByText('Deleted “Intro 新约”.');
});