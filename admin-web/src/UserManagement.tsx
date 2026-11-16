import React, { useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Super Admin' | 'Content Editor' | 'Member';
  status: 'Active' | 'Inactive';
  lastActive: string;
}

const DEFAULT_USERS: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@pingan.org', role: 'Super Admin', status: 'Active', lastActive: 'Just now' },
  { id: '2', name: 'Sarah Tan', email: 'sarahtan@pingan.org', role: 'Content Editor', status: 'Active', lastActive: '2 hours ago' },
  { id: '3', name: 'David Chen', email: 'david.c@example.com', role: 'Member', status: 'Active', lastActive: 'Yesterday' },
  { id: '4', name: 'Rachel Lim', email: 'rachel.lim@example.com', role: 'Member', status: 'Inactive', lastActive: '5 days ago' },
];

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' } : u))
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>Platform User Directory</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>Manage administrator privileges and community member access.</p>
        </div>
        <input
          type="text"
          placeholder="🔍 Search users by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px', width: '280px' }}
        />
      </div>

      <div style={{ background: 'var(--bg-card, #ffffff)', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <th style={{ padding: '14px 20px', color: 'var(--text-primary, #0f172a)' }}>User</th>
              <th style={{ padding: '14px 20px', color: 'var(--text-primary, #0f172a)' }}>Role</th>
              <th style={{ padding: '14px 20px', color: 'var(--text-primary, #0f172a)' }}>Status</th>
              <th style={{ padding: '14px 20px', color: 'var(--text-primary, #0f172a)' }}>Last Active</th>
              <th style={{ padding: '14px 20px', textAlign: 'right', color: 'var(--text-primary, #0f172a)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                <td style={{ padding: '14px 20px' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>{user.name}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>{user.email}</p>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    background: user.role === 'Super Admin' ? '#7e22ce20' : user.role === 'Content Editor' ? '#0284c720' : 'var(--table-header-bg, #f1f5f9)',
                    color: user.role === 'Super Admin' ? '#c084fc' : user.role === 'Content Editor' ? '#38bdf8' : 'var(--text-secondary, #475569)',
                    border: user.role === 'Super Admin' ? '1px solid #7e22ce40' : user.role === 'Content Editor' ? '1px solid #0284c740' : '1px solid var(--border-color, #cbd5e1)'
                  }}>
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: user.status === 'Active' ? '#22c55e' : 'var(--text-secondary, #94a3b8)'
                  }}>
                    ● {user.status}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>{user.lastActive}</td>
                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                  <button
                    onClick={() => toggleStatus(user.id)}
                    style={{
                      padding: '6px 12px',
                      background: user.status === 'Active' ? '#fef2f2' : '#f0fdf4',
                      color: user.status === 'Active' ? '#dc2626' : '#16a34a',
                      border: user.status === 'Active' ? '1px solid #fecaca' : '1px solid #bbf7d0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};