import React from 'react';

interface Props {
  gains: number[];
  active: boolean;
  contentType?: number;
}

const BAND_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

// Target curves mirrored from offscreen engine
const TARGET_CURVES: Record<number, number[]> = {
  [-1]: [1, 2, 1, 0, 1, 0, 1, 2, 3, 2],       // Speech
  [0]:  [5, 6, 4, 1, -1, -2, -1, 0, 2, 3],     // Harman
  [1]:  [6, 7, 5, 1, -1, -2, -1, 1, 3, 4],      // Music
};

export default function AutoEQVisualizer({ gains, active, contentType = 0 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const prevGains = React.useRef<number[]>(gains.map(() => 0));

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const bandCount = 10;
    const barWidth = (w - 60) / bandCount - 4;
    const gap = 4;
    const totalWidth = bandCount * (barWidth + gap) - gap;
    const startX = (w - totalWidth) / 2;

    const midY = h * 0.48;
    const maxPx = h * 0.36;
    const dBRange = 12;

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0c0c14');
    bgGrad.addColorStop(1, '#08080e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    const gridLevels = [9, 6, 3, 0, -3, -6, -9];
    for (const dB of gridLevels) {
      const y = midY - (dB / dBRange) * maxPx;
      ctx.strokeStyle = dB === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
      ctx.lineWidth = dB === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(startX - 8, y);
      ctx.lineTo(startX + totalWidth + 8, y);
      ctx.stroke();

      if (dB !== 0 && dB % 6 === 0) {
        ctx.fillStyle = '#3a3a4a';
        ctx.font = '7px Inter, Segoe UI, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${dB > 0 ? '+' : ''}${dB}`, startX - 12, y + 3);
      }
    }

    // Target curve (dashed spline)
    const targetCurve = TARGET_CURVES[contentType] || TARGET_CURVES[0];
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i < bandCount; i++) {
      const x = startX + i * (barWidth + gap) + barWidth / 2;
      const y = midY - (targetCurve[i] / dBRange) * maxPx;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Target curve dots
    for (let i = 0; i < bandCount; i++) {
      const x = startX + i * (barWidth + gap) + barWidth / 2;
      const y = midY - (targetCurve[i] / dBRange) * maxPx;
      ctx.fillStyle = 'rgba(129, 140, 248, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw EQ gain bars
    for (let i = 0; i < bandCount; i++) {
      const x = startX + i * (barWidth + gap);
      const gain = gains[i] ?? 0;

      // Smooth animation
      const prev = prevGains.current[i] ?? 0;
      const smooth = prev + (gain - prev) * 0.35;
      prevGains.current[i] = smooth;

      const barH = Math.abs(smooth / dBRange) * maxPx;
      const barY = smooth >= 0 ? midY - barH : midY;

      // Bar gradient
      const gradient = ctx.createLinearGradient(x, barY, x, barY + Math.max(2, barH));
      if (smooth >= 0) {
        gradient.addColorStop(0, '#c084fc');
        gradient.addColorStop(0.5, '#a78bfa');
        gradient.addColorStop(1, '#6366f1');
      } else {
        gradient.addColorStop(0, '#4338ca');
        gradient.addColorStop(1, '#312e81');
      }

      // Draw rounded bar
      ctx.fillStyle = gradient;
      const bx = x + 1;
      const bw = barWidth - 2;
      const by = barY;
      const bh = Math.max(2, barH);
      const radius = Math.min(3, bw / 2);

      ctx.beginPath();
      if (smooth >= 0) {
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + bw - radius, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
      } else {
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + bh - radius);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
        ctx.lineTo(bx + radius, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
        ctx.lineTo(bx, by);
      }
      ctx.fill();

      // Glow on active bars
      if (Math.abs(smooth) > 1.5) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.shadowColor = smooth >= 0 ? '#a78bfa' : '#6366f1';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      // Gain value label
      const showValue = Math.abs(smooth) > 0.5;
      if (showValue) {
        ctx.fillStyle = Math.abs(smooth) > 2 ? '#e0e0e8' : '#5a5a6a';
        ctx.font = `${Math.abs(smooth) > 2 ? '600' : '400'} 8px Inter, Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        const label = smooth > 0 ? `+${Math.round(smooth)}` : `${Math.round(smooth)}`;
        const labelY = smooth >= 0 ? by - 5 : by + bh + 10;
        ctx.fillText(label, x + barWidth / 2, labelY);
      }

      // Frequency label
      ctx.fillStyle = '#3a3a4a';
      ctx.font = '7px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(BAND_LABELS[i], x + barWidth / 2, h - 4);
    }

  }, [gains, active, contentType]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 4px 5px', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.5px',
      }}>
        <span style={{ fontWeight: 600 }}>EQ BANDS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '10px', height: '1.5px',
              background: 'rgba(129, 140, 248, 0.35)',
              borderTop: '1px dashed rgba(129, 140, 248, 0.5)',
            }} />
            <span style={{ fontSize: '8px' }}>Target</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '8px', height: '8px',
              background: 'linear-gradient(180deg, #c084fc, #6366f1)',
              borderRadius: '2px',
            }} />
            <span style={{ fontSize: '8px' }}>Actual</span>
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '150px',
          borderRadius: 'var(--radius-md)',
          background: '#0c0c14',
          display: 'block',
        }}
      />
    </div>
  );
}
