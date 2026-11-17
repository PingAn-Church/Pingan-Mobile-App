import React, { useState } from 'react';
import { getCurrentUser, getErrorMessage, logoutUser, Member, setMemberAdmin, setMemberInstructor } from './api';
import { Alert, btn, Modal, muted } from './courses/ui';

const fullName = (m: Member) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email;

const ROLE_INFO = {
  admin: {
    label: 'Administrator',
    can: 'Approve sign-ups, change anyone’s roles, publish announcements and events, upload pictures and videos, review reported messages, and edit every course.',
  },
  instructor: {
    label: 'Instructor',
    can: 'Create and edit courses, quizzes and lessons, grade short-answer quiz answers, and read course statistics.',
  },
};

type Change = { role: 'admin' | 'instructor'; grant: boolean };

export const RoleDialog: React.FC<{ member: Member; onClose: () => void; onChanged: (updated: Member) => void }> = ({ member, onClose, onChanged }) => {
  const me = getCurrentUser();
  const isSelf = me?.id === member.id;
  const [admin, setAdmin] = useState(member.admin);
  const [instructor, setInstructor] = useState(member.instructor);
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes: Change[] = [
    ...(admin !== member.admin ? [{ role: 'admin' as const, grant: admin }] : []),
    ...(instructor !== member.instructor ? [{ role: 'instructor' as const, grant: instructor }] : []),
  ];
  const demotingAdmin = changes.some((c) => c.role === 'admin' && !c.grant);
  const name = fullName(member);

  const apply = async () => {
    setSaving(true);
    setError(null);
    const current = { ...member };
    try {
      // Grants first, removals last: if anything fails part-way, nobody ends up with less access than intended.
      for (const c of [...changes].sort((a, b) => Number(b.grant) - Number(a.grant))) {
        if (c.role === 'admin') {
          await setMemberAdmin(member.id, c.grant);
          current.admin = c.grant;
        } else {
          await setMemberInstructor(member.id, c.grant);
          current.instructor = c.grant;
        }
      }
    } catch (err) {
      onChanged(current); // show whatever did change
      const done = (current.admin !== member.admin ? 1 : 0) + (current.instructor !== member.instructor ? 1 : 0);
      setError(`${done > 0 ? 'Some changes were saved, but not all. ' : ''}${getErrorMessage(err)}`);
      setSaving(false);
      setStep('choose');
      setAdmin(current.admin);
      setInstructor(current.instructor);
      return;
    }
    onChanged(current);
    if (isSelf && demotingAdmin) {
      // This browser's session no longer has administrator rights.
      await logoutUser();
      window.location.reload();
      return;
    }
    onClose();
  };

  const describe = (c: Change) => `${c.grant ? 'Make' : 'Remove'} ${name} ${c.grant ? 'an' : 'as'} ${ROLE_INFO[c.role].label.toLowerCase()}`;

  return (
    <Modal title={step === 'choose' ? `Roles for ${name}` : 'Confirm role change'} onClose={onClose} busy={saving}>
      {step === 'choose' ? (
        <div style={{ display: 'grid', gap: '14px' }}>
          <p style={{ ...muted, margin: 0 }}>{member.email}</p>
          {(['admin', 'instructor'] as const).map((role) => {
            const checked = role === 'admin' ? admin : instructor;
            return (
              <label
                key={role}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `1px solid ${checked ? '#16a34a' : 'var(--border-color, #e2e8f0)'}`,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => (role === 'admin' ? setAdmin(e.target.checked) : setInstructor(e.target.checked))}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '14px' }}>{ROLE_INFO[role].label}</strong>
                  <span style={{ ...muted, display: 'block' }}>{ROLE_INFO[role].can}</span>
                </span>
              </label>
            );
          })}
          <p style={{ ...muted, fontSize: '12px', margin: 0 }}>Members without either role can still use the app normally. Changes reach their phone straight away.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={btn('secondary')}>
              Cancel
            </button>
            <button type="button" disabled={changes.length === 0} onClick={() => setStep('confirm')} style={btn('primary', changes.length === 0)}>
              Review change{changes.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-primary, #0f172a)', fontSize: '14px' }}>
            {changes.map((c) => (
              <li key={c.role} style={{ color: c.grant ? undefined : '#b91c1c' }}>
                {describe(c)}
              </li>
            ))}
          </ul>
          {changes
            .filter((c) => c.grant)
            .map((c) => (
              <p key={c.role} style={{ ...muted, margin: 0 }}>
                As {ROLE_INFO[c.role].label.toLowerCase()}, {name} will be able to: {ROLE_INFO[c.role].can.charAt(0).toLowerCase() + ROLE_INFO[c.role].can.slice(1)}
              </p>
            ))}
          {demotingAdmin && (
            <Alert kind="error">
              {isSelf ? (
                <>
                  <strong>You are removing your own administrator role.</strong> You will be signed out straight away and will no longer be able to manage
                  members, announcements or other people’s roles. Only another administrator can give it back.
                </>
              ) : (
                <>
                  {name} will immediately lose access to member approval, announcements, events, reports and role management.
                </>
              )}
            </Alert>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setStep('choose')} disabled={saving} style={btn('secondary', saving)}>
              Back
            </button>
            <button type="button" onClick={() => void apply()} disabled={saving} style={btn(demotingAdmin ? 'danger' : 'primary', saving)} autoFocus>
              {saving ? 'Saving…' : demotingAdmin ? 'Yes, remove administrator role' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default RoleDialog;
