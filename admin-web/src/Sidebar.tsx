import React, { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'dashboard' | 'courses' | 'announcements' | 'users') => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: '📊' },
    { id: 'courses', label: 'Course Studio', icon: '🎥' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
    { id: 'users', label: 'User Directory', icon: '👥' },
  ];

  return (
    <>
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
        }}
      >
        <div>
          {/* Brand Header */}
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #1e293b' }}>
            <h1 style={{ margin: 0, fontSize: '18px', color: '#f8fafc', fontWeight: 700, letterSpacing: '-0.5px' }}>
              Pingan Console
            </h1>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Enterprise Portal
            </span>
          </div>

          {/* Navigation Menu */}
          <nav style={{ padding: '16px 12px' }}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
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
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer with Settings Button & Status */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b' }}>
          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              marginBottom: '16px',
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>⚙️</span> System Settings
          </button>

          <div style={{ fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              Spring Boot REST v1.2
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Connected via JWT Session</p>
          </div>
        </div>
      </aside>

      {/* Settings Modal Pop-up */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: isDarkMode ? '#0f172a' : '#ffffff',
              color: isDarkMode ? '#f8fafc' : '#0f172a',
              padding: '28px',
              borderRadius: '12px',
              width: '420px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>⚙️ Admin Portal Preferences</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: isDarkMode ? '#94a3b8' : '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Theme Selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#f1f5f9'}` }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>Interface Theme</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Toggle dark or light workspace theme</p>
                </div>
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  style={{
                    padding: '6px 14px',
                    background: isDarkMode ? '#1e293b' : '#e0f2fe',
                    color: isDarkMode ? '#38bdf8' : '#0369a1',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
                </button>
              </div>

              {/* Auto Sync Switch */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#f1f5f9'}` }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>Live REST Auto-Sync</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Poll Spring Boot server every 30s</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              {/* Cache Control */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>Local Storage Cache</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Reset cached state & JWT tokens</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Purge Cache
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              style={{
                width: '100%',
                marginTop: '24px',
                padding: '10px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done & Save
            </button>
          </div>
        </div>
      )}
    </>
  );
};