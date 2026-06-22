import React from 'react';

interface Props {
  data: number[];
  active: boolean;
  eqGains?: number[];
}

export default function SpectrumVisualizer({ data, active }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const prevData = React.useRef<number[]>([]);
  const peakHold = React.useRef<number[]>([]);
  const peakDecay = React.useRef<number[]>([]);
  const frameRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const barCount = data.length || 32;
    frameRef.current++;

    ctx.clearRect(0, 0, w, h);

    // Background with subtle gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0c0c14');
    bgGrad.addColorStop(1, '#08080e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    if (!active || data.length === 0) {
      // Idle: animated noise bars
      const t = frameRef.current * 0.02;
      for (let i = 0; i < 32; i++) {
        const x = i * (w / 32);
        const barH = 2 + Math.sin(t + i * 0.5) * 2 + Math.random() * 1.5;
        ctx.fillStyle = '#1a1a26';
        ctx.fillRect(x + 1, h - barH - 8, w / 32 - 2, barH);
      }
      ctx.fillStyle = '#2a2a3a';
      ctx.font = '500 11px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for audio…', w / 2, h / 2 + 4);
      return;
    }

    // Init peak arrays
    if (peakHold.current.length !== barCount) {
      peakHold.current = new Array(barCount).fill(0);
      peakDecay.current = new Array(barCount).fill(0);
    }

    // Smooth
    const smoothed = data.map((val, i) => {
      const prev = prevData.current[i] || 0;
      return prev + (val - prev) * 0.4;
    });
    prevData.current = smoothed;

    const barW = (w - barCount - 1) / barCount;
    const maxH = h - 24;
    const bottomY = h - 12;

    // dB grid lines
    ctx.lineWidth = 0.5;
    const gridLevels = [0.25, 0.5, 0.75];
    for (const level of gridLevels) {
      const y = bottomY - level * maxH;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // dB labels
    ctx.fillStyle = '#2a2a3a';
    ctx.font = '7px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    const dbLabels = ['-18', '-12', '-6'];
    for (let i = 0; i < gridLevels.length; i++) {
      const y = bottomY - gridLevels[i] * maxH;
      ctx.fillText(dbLabels[i], w - 3, y + 3);
    }

    // Main gradient
    const gradient = ctx.createLinearGradient(0, bottomY, 0, bottomY - maxH);
    gradient.addColorStop(0, '#312e81');
    gradient.addColorStop(0.25, '#4338ca');
    gradient.addColorStop(0.5, '#6366f1');
    gradient.addColorStop(0.7, '#818cf8');
    gradient.addColorStop(0.85, '#a78bfa');
    gradient.addColorStop(1, '#c084fc');

    for (let i = 0; i < barCount; i++) {
      const val = smoothed[i] || 0;
      const barH = Math.max(2, (val / 255) * maxH);
      const x = i * (barW + 1) + 0.5;
      const y = bottomY - barH;

      // Bar body with rounded top
      ctx.fillStyle = gradient;
      const radius = Math.min(2.5, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barW - radius, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
      ctx.lineTo(x + barW, bottomY);
      ctx.lineTo(x, bottomY);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // Glow for tall bars
      if (barH > maxH * 0.4) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      // Peak hold indicator
      peakHold.current[i] = Math.max(peakHold.current[i] * 0.995, barH);
      if (peakHold.current[i] > 4) {
        const peakY = bottomY - peakHold.current[i];
        ctx.fillStyle = `rgba(192, 132, 252, ${Math.min(1, peakHold.current[i] / maxH + 0.3)})`;
        ctx.fillRect(x + 1, peakY - 1.5, barW - 2, 1.5);
      }

      // Reflection (mirror effect at bottom)
      if (barH > 5) {
        const reflH = barH * 0.15;
        const reflGrad = ctx.createLinearGradient(0, bottomY, 0, bottomY + reflH);
        reflGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
        reflGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.fillStyle = reflGrad;
        ctx.fillRect(x, bottomY, barW, reflH);
      }
    }

    // Frequency labels
    const freqLabels = ['31', '', '125', '', '500', '', '2k', '', '8k', ''];
    const labelStep = barCount / freqLabels.length;
    ctx.fillStyle = '#3a3a4a';
    ctx.font = '7px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < freqLabels.length; i++) {
      if (freqLabels[i]) {
        const x = (i + 0.5) * labelStep * (barW + 1);
        ctx.fillText(freqLabels[i], x, h - 2);
      }
    }
  }, [data, active]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '120px',
        borderRadius: 'var(--radius-md)',
        background: '#0c0c14',
        display: 'block',
      }}
    />
  );
}
