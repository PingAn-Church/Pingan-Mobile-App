import React, { useEffect, useState } from 'react';
import { API_BASE_URL, checkServerHealth } from './api';

type Tab = 'dashboard' | 'courses' | 'announcements' | 'users';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: Tab) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  /** Administrators see everything; instructors only see teaching screens. */
  isAdmin: boolean;
}

// What each role sees. The server still makes every permission decision;
// this only hides screens a role could not use anyway.
const NAV_ITEMS: { id: Tab; label: string; icon: string; adminOnly: boolean }[] = [
  { id: 'dashboard', label: 'Overview Dashboard', icon: '📊', adminOnly: false },
  { id: 'courses', label: 'Course Studio', icon: '🎥', adminOnly: false },
  { id: 'announcements', label: 'Announcements', icon: '📢', adminOnly: true },
  { id: 'users', label: 'User Directory', icon: '👥', adminOnly: true },
];

export const visibleTabs = (isAdmin: boolean): Tab[] => NAV_ITEMS.filter((n) => isAdmin || !n.adminOnly).map((n) => n.id);

type Health = 'checking' | 'up' | 'down';

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isDarkMode, setIsDarkMode, isAdmin }) => {
  const [health, setHealth] = useState<Health>('checking');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  // Real connection status: ask the server's public health check every 30 seconds.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await checkServerHealth();
      if (cancelled) return;
      setHealth(ok ? 'up' : 'down');
      setCheckedAt(new Date());
    };
    void check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const statusColor = health === 'up' ? '#22c55e' : health === 'down' ? '#ef4444' : '#94a3b8';
  const statusText = health === 'up' ? 'Server connected' : health === 'down' ? 'Server unreachable' : 'Checking server…';
  const host = API_BASE_URL.replace(/^https?:\/\//, '');

  return (
    <aside
      style={{
        width: '240px',
        background: '#0f172a',
        color: '#94a3b8',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100vh',
        boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #1e293b' }}>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#f8fafc', fontWeight: 700, letterSpacing: '-0.5px' }}>Ping-An Console</h1>
          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {isAdmin ? 'Administrator' : 'Instructor'}
          </span>
        </div>

        <nav aria-label="Main" style={{ padding: '16px 12px' }}>
          {NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '6px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? '#1e293b' : 'transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span aria-hidden style={{ fontSize: '16px' }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b', display: 'grid', gap: '14px' }}>
        <button
          type="button"
          onClick={() => setIsDarkMode(!isDarkMode)}
          aria-pressed={isDarkMode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span aria-hidden>{isDarkMode ? '☀️' : '🌙'}</span>
          {isDarkMode ? 'Light mode' : 'Dark mode'}
        </button>

        <div style={{ fontSize: '12px' }} role="status" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: statusColor, fontWeight: 600 }}>
            <span aria-hidden style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
            {statusText}
          </div>
          <p style={{ margin: '4px 0 0', color: '#64748b', wordBreak: 'break-all' }}>
            {host}
            {checkedAt ? ` · checked ${checkedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
      </div>
    </aside>
  );
};