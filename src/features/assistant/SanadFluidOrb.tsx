import { useEffect, useRef, useState } from 'react';

export type SanadOrbState = 'idle' | 'listening' | 'thinking' | 'executing' | 'success';

type Props = {
  state?: SanadOrbState;
  size?: number;
  className?: string;
  label?: string;
  animated?: boolean;
};

type OrbProfile = {
  speed: number;
  amplitude: number;
  secondaryAmplitude: number;
  wave: string;
  waveSecondary: string;
  glow: string;
  ring: string;
};

const PROFILES: Record<SanadOrbState, OrbProfile> = {
  idle: {
    speed: 0.00075,
    amplitude: 0.045,
    secondaryAmplitude: 0.025,
    wave: '#42d9ff',
    waveSecondary: '#5577ff',
    glow: '#58d7ff',
    ring: 'rgba(116, 171, 255, .42)',
  },
  listening: {
    speed: 0.0021,
    amplitude: 0.13,
    secondaryAmplitude: 0.07,
    wave: '#55e7ff',
    waveSecondary: '#38bdf8',
    glow: '#6ee7f9',
    ring: 'rgba(103, 232, 249, .72)',
  },
  thinking: {
    speed: 0.00145,
    amplitude: 0.082,
    secondaryAmplitude: 0.052,
    wave: '#4fd7ff',
    waveSecondary: '#6d78ff',
    glow: '#818cf8',
    ring: 'rgba(129, 140, 248, .62)',
  },
  executing: {
    speed: 0.0027,
    amplitude: 0.105,
    secondaryAmplitude: 0.075,
    wave: '#32d5ff',
    waveSecondary: '#4f6cff',
    glow: '#60a5fa',
    ring: 'rgba(96, 165, 250, .76)',
  },
  success: {
    speed: 0.0011,
    amplitude: 0.04,
    secondaryAmplitude: 0.022,
    wave: '#67e8f9',
    waveSecondary: '#34d399',
    glow: '#5eead4',
    ring: 'rgba(94, 234, 212, .78)',
  },
};

function drawOrb(
  context: CanvasRenderingContext2D,
  size: number,
  state: SanadOrbState,
  time: number,
): void {
  const profile = PROFILES[state];
  const center = size / 2;
  const radius = size * 0.455;
  const phase = time * profile.speed;
  const amplitude = size * profile.amplitude;
  const secondaryAmplitude = size * profile.secondaryAmplitude;

  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();

  const base = context.createRadialGradient(
    size * 0.34,
    size * 0.25,
    size * 0.04,
    center,
    center,
    radius * 1.2,
  );
  base.addColorStop(0, '#243d78');
  base.addColorStop(0.44, '#102757');
  base.addColorStop(0.78, '#0b1738');
  base.addColorStop(1, '#071126');
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  const driftX = center + Math.cos(phase * 0.72) * radius * 0.22;
  const driftY = center - radius * 0.16 + Math.sin(phase * 0.9) * radius * 0.12;
  const aura = context.createRadialGradient(driftX, driftY, 0, driftX, driftY, radius * 0.9);
  aura.addColorStop(0, state === 'success' ? 'rgba(45, 212, 191, .38)' : 'rgba(79, 70, 229, .34)');
  aura.addColorStop(0.58, 'rgba(37, 99, 235, .14)');
  aura.addColorStop(1, 'rgba(15, 23, 42, 0)');
  context.fillStyle = aura;
  context.fillRect(0, 0, size, size);

  const paintWave = (
    offset: number,
    localAmplitude: number,
    colorA: string,
    colorB: string,
    alpha: number,
    frequency: number,
  ) => {
    const baseline = center + offset;
    context.beginPath();
    context.moveTo(0, size);
    for (let x = 0; x <= size; x += Math.max(1, size / 36)) {
      const normalized = x / size;
      const y = baseline
        + Math.sin((normalized * frequency * Math.PI * 2) + phase) * localAmplitude
        + Math.sin((normalized * 1.7 * Math.PI * 2) - phase * 0.64) * localAmplitude * 0.32;
      context.lineTo(x, y);
    }
    context.lineTo(size, size);
    context.closePath();

    const gradient = context.createLinearGradient(0, baseline - localAmplitude, size, size);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(0.56, colorB);
    gradient.addColorStop(1, '#293b9f');
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.fill();
    context.globalAlpha = 1;
  };

  paintWave(radius * 0.06, amplitude, profile.wave, profile.waveSecondary, 0.7, 1.15);
  paintWave(radius * 0.28, secondaryAmplitude, profile.waveSecondary, '#22d3ee', 0.32, 1.55);

  const glass = context.createLinearGradient(0, 0, size, size);
  glass.addColorStop(0, 'rgba(255,255,255,.28)');
  glass.addColorStop(0.28, 'rgba(255,255,255,.055)');
  glass.addColorStop(0.68, 'rgba(255,255,255,0)');
  glass.addColorStop(1, 'rgba(255,255,255,.08)');
  context.fillStyle = glass;
  context.fillRect(0, 0, size, size);

  context.restore();

  const edge = context.createLinearGradient(size * 0.1, size * 0.08, size * 0.9, size * 0.94);
  edge.addColorStop(0, 'rgba(255,255,255,.72)');
  edge.addColorStop(0.35, profile.ring);
  edge.addColorStop(1, 'rgba(71, 85, 105, .32)');
  context.strokeStyle = edge;
  context.lineWidth = Math.max(0.8, size * 0.025);
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();

  const highlight = context.createRadialGradient(
    size * 0.32,
    size * 0.22,
    0,
    size * 0.32,
    size * 0.22,
    radius * 0.48,
  );
  highlight.addColorStop(0, 'rgba(255,255,255,.42)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = highlight;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fill();
}

export default function SanadFluidOrb({
  state = 'idle',
  size = 32,
  className = '',
  label = 'سند',
  animated = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const preferCssFallback = size < 22 || (!animated && size < 28);
    if (!canvas || preferCssFallback) {
      setCanvasReady(false);
      return;
    }

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d', { alpha: true });
    } catch {
      context = null;
    }
    if (!context) {
      setCanvasReady(false);
      return;
    }

    setCanvasReady(true);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = Math.max(1, Math.round(size * dpr));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedMotion = media.matches;
    let frame = 0;
    let stopped = false;

    const render = (time: number) => {
      if (stopped || !context) return;
      drawOrb(context, size, state, reducedMotion ? 0 : time);
      if (!reducedMotion && animated) frame = window.requestAnimationFrame(render);
    };

    render(performance.now());

    return () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      context?.clearRect(0, 0, size, size);
    };
  }, [animated, size, state]);

  return (
    <span
      className={`sanad-fluid-orb sanad-orb-${state} ${canvasReady ? 'sanad-orb-canvas-ready' : 'sanad-orb-css-fallback'} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-orb-state={state}
    >
      <span className="sanad-fluid-orb__fallback" aria-hidden="true">
        <span className="sanad-fluid-orb__core" />
        <span className="sanad-fluid-orb__wave sanad-fluid-orb__wave--a" />
        <span className="sanad-fluid-orb__wave sanad-fluid-orb__wave--b" />
        <span className="sanad-fluid-orb__shine" />
      </span>
      <canvas ref={canvasRef} className="sanad-fluid-orb__canvas" aria-hidden="true" />
    </span>
  );
}
