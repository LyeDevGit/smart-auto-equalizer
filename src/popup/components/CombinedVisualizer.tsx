import React, { useRef, useEffect } from 'react';
import { BAND_FREQUENCIES, BAND_LABELS, type AudioStats } from '../../types';

interface Props {
  freqData: number[];
  eqGains: number[];
  active: boolean;
  bypass: boolean;
  contentType: number;
  stats: AudioStats;
}

function freqToX(freq: number, width: number) {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  return ((Math.log10(freq) - minLog) / (maxLog - minLog)) * width;
}

function drawSpline(ctx: CanvasRenderingContext2D, pts: {x: number, y: number}[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 3; // Tension
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / t, p1.y + (p2.y - p0.y) / t,
      p2.x - (p3.x - p1.x) / t, p2.y - (p3.y - p1.y) / t,
      p2.x, p2.y
    );
  }
}

export default function CombinedVisualizer({ freqData, eqGains, active, bypass, stats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothGains = useRef<number[]>([...eqGains]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use computed style to support CSS dark mode variables natively
    const style = getComputedStyle(document.body);
    const colorBorder = style.getPropertyValue('--border').trim() || '#e4e4e7';
    const colorMuted = style.getPropertyValue('--muted-foreground').trim() || '#71717a';
    const colorChartLine = style.getPropertyValue('--chart-line').trim() || '#3b82f6';
    const colorChartFill = style.getPropertyValue('--chart-fill').trim() || 'rgba(59, 130, 246, 0.1)';
    const colorChartBar = style.getPropertyValue('--chart-bar').trim() || '#e4e4e7';

    for (let i=0; i<10; i++) {
      if (smoothGains.current[i] === undefined) smoothGains.current[i] = 0;
      smoothGains.current[i] += ((eqGains[i]||0) - smoothGains.current[i]) * 0.2;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const W = rect.width;
    const H = rect.height;
    const midY = H / 2;
    const dbRange = 12;

    ctx.clearRect(0, 0, W, H);

    // Grid line
    ctx.strokeStyle = colorBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY); ctx.lineTo(W, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (active && freqData.length > 0) {
      // Spectrum
      const barW = W / freqData.length;
      ctx.fillStyle = colorChartBar;
      for (let i = 0; i < freqData.length; i++) {
        const val = freqData[i] / 255;
        const h = val * H * 0.8;
        ctx.fillRect(i * barW + 1, H - h, barW - 2, h);
      }
    } else {
      ctx.fillStyle = colorMuted;
      ctx.textAlign = 'center';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Waiting for audio...', W/2, H/2 + 4);
    }

    // EQ Spline Curve
    const pts = BAND_FREQUENCIES.map((freq, i) => ({
      x: freqToX(freq, W),
      y: midY - (smoothGains.current[i] / dbRange) * (H / 2) * 0.8
    }));
    pts.unshift({ x: 0, y: pts[0].y });
    pts.push({ x: W, y: pts[pts.length-1].y });

    ctx.save();
    drawSpline(ctx, pts);
    ctx.strokeStyle = bypass ? colorMuted : colorChartLine;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = bypass ? 'transparent' : colorChartFill;
    ctx.fill();
    ctx.restore();

    // EQ Dots & Labels
    const colorBg = style.getPropertyValue('--background').trim() || '#ffffff';
    for (let i = 0; i < BAND_FREQUENCIES.length; i++) {
      const x = freqToX(BAND_FREQUENCIES[i], W);
      const y = midY - (smoothGains.current[i] / dbRange) * (H / 2) * 0.8;
      
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = bypass ? colorMuted : colorChartLine;
      ctx.fill();
      ctx.strokeStyle = colorBg;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = colorMuted;
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(BAND_LABELS[i], x, H - 6);
    }

    // HUD Stats
    if (active) {
      ctx.fillStyle = colorMuted;
      ctx.font = '500 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Peak: ${stats.peakDb.toFixed(1)} dB`, 8, 16);
      ctx.textAlign = 'right';
      ctx.fillText(`${stats.lufs.toFixed(1)} dB avg`, W - 8, 16);
    }

  }, [freqData, eqGains, active, bypass, stats]);

  return <canvas ref={canvasRef} />;
}
