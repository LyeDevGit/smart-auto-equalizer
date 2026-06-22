import React from 'react';

interface Props {
  volume: number;
  onChange: (volume: number) => void;
}

export default function VolumeControl({ volume, onChange }: Props) {
  const pct = Math.round(volume * 100);
  const isBoost = pct > 100;
  const isLoud = pct > 140;

  return (
    <div className="volume-card" style={{
      borderColor: isLoud ? 'rgba(248, 113, 113, 0.3)' : isBoost ? 'rgba(251, 191, 36, 0.2)' : undefined,
    }}>
      <span className="volume-icon" style={{
        filter: isLoud ? 'drop-shadow(0 0 4px rgba(248,113,113,0.5))' : undefined,
      }}>
        {pct > 120 ? '🔊' : pct > 60 ? '🔉' : pct > 0 ? '🔈' : '🔇'}
      </span>
      <input
        type="range" min="0" max="200" value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{
          flex: 1,
          background: `linear-gradient(to right, ${
            isBoost ? '#fbbf24' : '#6366f1'
          } 0%, ${
            isBoost ? '#f87171' : '#a78bfa'
          } ${pct / 2}%, var(--border) ${pct / 2}%, var(--border) 100%)`,
        }}
      />
      <span className="volume-value" style={{
        color: isLoud ? '#f87171' : isBoost ? '#fbbf24' : 'var(--text-secondary)',
      }}>
        {pct}%
      </span>
    </div>
  );
}
