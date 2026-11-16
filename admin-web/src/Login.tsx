import React, { useState } from 'react';
import { loginUser, getErrorMessage, CurrentUser } from './api';

interface LoginProps {
  onLoginSuccess: (user: CurrentUser) => void;
  /** Shown as a box over the current screen when the session has expired. */
  sessionExpired?: boolean;
  /** When re-signing in after expiry, it must be the same account. */
  expectedEmail?: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, sessionExpired = false, expectedEmail }) => {
  const [email, setEmail] = useState(expectedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // ignore double-clicks
    setError(null);
    setLoading(true);
    try {
      const user = await loginUser(email.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <div
      style={{
        width: '100%',
        maxWidth: '400px',
        padding: '30px',
        background: '#ffffff',
        color: '#0f172a',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ marginTop: 0 }}>{sessionExpired ? 'Session expired' : 'Admin Console Login'}</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>
        {sessionExpired
          ? 'For your security you were signed out. Sign in again to continue. Your unsaved work on this page is still here.'
          : 'Sign in with your Ping-An administrator or instructor account.'}
      </p>

      {error && (
        <div
          role="alert"
          style={{ color: '#d32f2f', background: '#ffebee', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="login-email" style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={!sessionExpired}
            readOnly={sessionExpired && Boolean(expectedEmail)}
            autoComplete="username"
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            placeholder="admin@example.com"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="login-password" style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus={sessionExpired}
            autoComplete="current-password"
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#90caf9' : '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );

  if (sessionExpired) {
    // Overlay: the page underneath (and anything typed into it) stays mounted.
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 1000,
        }}
      >
        {card}
      </div>
    );
  }

  return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 16px' }}>{card}</div>;
};