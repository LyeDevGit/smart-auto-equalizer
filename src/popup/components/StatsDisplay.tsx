import React from 'react';
import type { AudioStats } from '../../types';

interface Props {
  stats: AudioStats;
  active: boolean;
}

export default function StatsDisplay({ stats, active }: Props) {
  if (!active) return null;

  const formatDb = (db: number): string => {
    if (!isFinite(db) || db < -80) return '—';
    return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
  };

  const formatLufs = (lufs: number): string => {
    if (!isFinite(lufs) || lufs < -60) return '—';
    return lufs.toFixed(1);
  };

  const items = [
    {
      value: formatDb(stats.peakReduction),
      unit: 'dB',
      label: 'PEAK RED.',
      color: stats.peakReduction < -2 ? '#f87171' : stats.peakReduction < -0.5 ? '#fbbf24' : '#34d399',
    },
    {
      value: formatLufs(stats.lufs),
      unit: 'LUFS',
      label: 'LOUDNESS',
      color: stats.lufs > -10 ? '#f87171' : stats.lufs > -16 ? '#fbbf24' : '#a78bfa',
    },
    {
      value: formatDb(stats.peakDb),
      unit: 'dB',
      label: 'PEAK',
      color: stats.peakDb > -1 ? '#f87171' : stats.peakDb > -6 ? '#fbbf24' : '#818cf8',
    },
  ];

  return (
    <div className="stats-grid">
      {items.map((item, i) => (
        <div key={i} className="stat-card">
          <div className="stat-value" style={{ color: item.color }}>
            {item.value}
            <span style={{ fontSize: '9px', fontWeight: 500, marginLeft: '2px', opacity: 0.7 }}>
              {item.unit}
            </span>
          </div>
          <div className="stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
