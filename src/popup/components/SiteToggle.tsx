import React from 'react';

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function SiteToggle({ enabled, onToggle }: Props) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Disable EQ' : 'Enable EQ'}
    >
      <span style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
        color: enabled ? 'var(--success)' : 'var(--text-dim)',
        transition: 'color var(--transition-base)',
      }}>
        {enabled ? 'ON' : 'OFF'}
      </span>
      <div style={{
        width: '42px', height: '22px', borderRadius: '11px',
        background: enabled
          ? 'var(--accent-gradient)'
          : 'var(--bg-elevated)',
        border: enabled ? 'none' : '1px solid var(--border)',
        position: 'relative',
        transition: 'all var(--transition-base)',
        boxShadow: enabled ? '0 2px 12px rgba(99, 102, 241, 0.35)' : 'none',
      }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: enabled ? '#fff' : 'var(--text-dim)',
          position: 'absolute', top: '2px',
          left: enabled ? '22px' : '2px',
          transition: 'all var(--transition-base)',
          boxShadow: enabled
            ? '0 1px 4px rgba(0, 0, 0, 0.3), 0 0 8px rgba(255,255,255,0.1)'
            : '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
    </div>
  );
}
