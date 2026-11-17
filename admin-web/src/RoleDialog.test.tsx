import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoleDialog } from './RoleDialog';
import { Sidebar } from './Sidebar';
import * as api from './api';

jest.mock('./api', () => {
  const actual = jest.requireActual('./api');
  const m: any = { ...actual };
  ['getCurrentUser', 'setMemberAdmin', 'setMemberInstructor', 'logoutUser', 'checkServerHealth'].forEach((f) => (m[f] = jest.fn()));
  return m;
});
const A = api as jest.Mocked<typeof api>;
const grace = { id: 5, firstName: 'Grace', lastName: 'Ng', email: 'g@test.com', verifiedUser: true, admin: false, instructor: false };
const me = { id: 1, firstName: 'Prasanna', lastName: '', email: 'a@test.com', admin: true, instructor: false };

beforeEach(() => {
  jest.clearAllMocks();
  A.getCurrentUser.mockReturnValue(me);
  A.setMemberAdmin.mockResolvedValue();
  A.setMemberInstructor.mockResolvedValue();
});

test('grant instructor: confirm names the change, then saves', async () => {
  const onChanged = jest.fn(); const onClose = jest.fn();
  render(<RoleDialog member={grace} onClose={onClose} onChanged={onChanged} />);
  fireEvent.click(screen.getByLabelText(/Instructor/));
  fireEvent.click(screen.getByText('Review change'));
  expect(screen.getByText('Make Grace Ng an instructor')).toBeTruthy();
  fireEvent.click(screen.getByText('Confirm'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(A.setMemberInstructor).toHaveBeenCalledWith(5, true);
  expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ instructor: true }));
});

test('last admin refusal is explained in plain words', async () => {
  A.setMemberAdmin.mockRejectedValue(new api.LastAdminError());
  const admin = { ...grace, admin: true };
  render(<RoleDialog member={admin} onClose={() => {}} onChanged={() => {}} />);
  fireEvent.click(screen.getByLabelText(/Administrator/));
  fireEvent.click(screen.getByText('Review change'));
  expect(screen.getByText(/will immediately lose access/)).toBeTruthy();
  fireEvent.click(screen.getByText('Yes, remove administrator role'));
  expect(await screen.findByText(/only administrator/)).toBeTruthy();
});

test('removing your own admin role warns and signs you out', async () => {
  A.logoutUser.mockResolvedValue();
  const reload = jest.fn();
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
  render(<RoleDialog member={{ ...grace, id: 1, admin: true }} onClose={() => {}} onChanged={() => {}} />);
  fireEvent.click(screen.getByLabelText(/Administrator/));
  fireEvent.click(screen.getByText('Review change'));
  expect(screen.getByText(/removing your own administrator role/)).toBeTruthy();
  fireEvent.click(screen.getByText('Yes, remove administrator role'));
  await waitFor(() => expect(reload).toHaveBeenCalled());
  expect(A.logoutUser).toHaveBeenCalled();
});

test('instructor sidebar hides admin tabs; status shows unreachable server', async () => {
  A.checkServerHealth.mockResolvedValue(false);
  render(<Sidebar activeTab="dashboard" setActiveTab={() => {}} isDarkMode={false} setIsDarkMode={() => {}} isAdmin={false} />);
  expect(screen.queryByText('User Directory')).toBeNull();
  expect(screen.queryByText('Announcements')).toBeNull();
  expect(screen.getByText('Course Studio')).toBeTruthy();
  expect(await screen.findByText('Server unreachable')).toBeTruthy();
});
