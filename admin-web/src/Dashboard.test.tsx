import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import * as api from './api';

jest.mock('./api', () => {
  const actual = jest.requireActual('./api');
  const m: any = { ...actual };
  ['countOpenReports', 'countPendingGrading', 'getAllAnnouncements', 'getCurrentUser', 'listCourses', 'listMembers'].forEach((f) => (m[f] = jest.fn()));
  return m;
});
const A = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  A.listMembers.mockImplementation(async (o: any) => ({ members: [], hasMore: false, totalCount: o.verified === false ? 5 : o.role === 'admin' ? 2 : o.role === 'instructor' ? 3 : 40 }));
  A.countOpenReports.mockRejectedValue(new Error('boom'));
  A.countPendingGrading.mockResolvedValue(0);
  A.getAllAnnouncements.mockResolvedValue([{ id: 1, title: '主日崇拜 Sunday Service', imageUrl: '' }]);
  A.listCourses.mockImplementation(async (o: any = {}) => ({ courses: [{ id: '1', title: '新约概论', is_published: true, updated_at: '2026-11-17' } as any], hasMore: false, totalCount: o.published === true ? 2 : o.published === false ? 1 : 3 }));
});

test('admin sees real counts, failures are labelled, button navigates', async () => {
  A.getCurrentUser.mockReturnValue({ id: 1, firstName: 'John', lastName: 'Cena', email: 'a', admin: true, instructor: false });
  const nav = jest.fn();
  render(<Dashboard onNavigate={nav} />);
  expect(await screen.findByText('5')).toBeTruthy();
  expect(screen.getByText('40')).toBeTruthy();
  expect(screen.getByText(/Couldn't load: boom/)).toBeTruthy();
  expect(screen.getByText('All clear 🎉')).toBeTruthy();
  expect(screen.getByText('Latest: 主日崇拜 Sunday Service')).toBeTruthy();
  expect(screen.getByText('新约概论')).toBeTruthy();
  fireEvent.click(screen.getByText('Review sign-ups'));
  expect(nav).toHaveBeenCalledWith('users');
});

test('instructor does not see admin-only tiles or call admin endpoints', async () => {
  A.getCurrentUser.mockReturnValue({ id: 2, firstName: 'Grace', lastName: '', email: 'g', admin: false, instructor: true });
  render(<Dashboard />);
  await screen.findByText('Short answers to grade');
  await waitFor(() => expect(A.listCourses).toHaveBeenCalled());
  expect(screen.queryByText('New members waiting for approval')).toBeNull();
  expect(screen.queryByText('Approved members')).toBeNull();
  expect(A.listMembers).not.toHaveBeenCalled();
  expect(A.countOpenReports).not.toHaveBeenCalled();
});
