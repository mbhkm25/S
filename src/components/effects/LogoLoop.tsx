import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './LogoLoop.css';

type LogoImageItem = {
  src: string;
  alt: string;
  title?: string;
};

type LogoNodeItem = {
  node: ReactNode;
  title: string;
};

export type LogoLoopItem = LogoImageItem | LogoNodeItem;

type LogoLoopProps = {
  logos: LogoLoopItem[];
  speed?: number;
  direction?: 'left' | 'right';
  logoHeight?: number;
  gap?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  ariaLabel?: string;
  className?: string;
};

type LogoLoopStyle = CSSProperties & {
  '--logoloop-gap': string;
  '--logoloop-logo-height': string;
  '--logoloop-fade-color'?: string;
};

const MIN_COPIES = 2;
const COPY_HEADROOM = 2;

function LogoLoop({
  logos,
  speed = 34,
  direction = 'left',
  logoHeight = 30,
  gap = 28,
  fadeOut = true,
  fadeOutColor = '#f7f8fa',
  ariaLabel = 'شعارات الجهات المالية المدعومة',
  className = ''
}: LogoLoopProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef<HTMLUListElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const [sequenceWidth, setSequenceWidth] = useState(0);
  const [copyCount, setCopyCount] = useState(MIN_COPIES);
  const [reduceMotion, setReduceMotion] = useState(false);

  const measure = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const width = sequenceRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    const roundedWidth = Math.ceil(width);
    setSequenceWidth(roundedWidth);
    setCopyCount(Math.max(MIN_COPIES, Math.ceil(containerWidth / roundedWidth) + COPY_HEADROOM));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener?.('change', sync);
    return () => mediaQuery.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (sequenceRef.current) observer.observe(sequenceRef.current);
    return () => observer.disconnect();
  }, [logos, gap, logoHeight, measure]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || sequenceWidth <= 0 || reduceMotion) {
      if (track) track.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    const directionMultiplier = direction === 'left' ? 1 : -1;
    const animate = (timestamp: number) => {
      if (lastTimestampRef.current === null) lastTimestampRef.current = timestamp;
      const delta = Math.max(0, timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      offsetRef.current = (offsetRef.current + speed * directionMultiplier * delta + sequenceWidth) % sequenceWidth;
      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [direction, reduceMotion, sequenceWidth, speed]);

  const style: LogoLoopStyle = {
    '--logoloop-gap': `${gap}px`,
    '--logoloop-logo-height': `${logoHeight}px`,
    '--logoloop-fade-color': fadeOutColor
  };

  const lists = useMemo(() => Array.from({ length: copyCount }, (_, copyIndex) => (
    <ul
      key={`copy-${copyIndex}`}
      ref={copyIndex === 0 ? sequenceRef : undefined}
      className="financial-logo-loop__list"
      aria-hidden={copyIndex > 0}
    >
      {logos.map((item, itemIndex) => (
        <li key={`${copyIndex}-${itemIndex}`} className="financial-logo-loop__item">
          {'src' in item ? (
            <img src={item.src} alt={copyIndex === 0 ? item.alt : ''} title={item.title ?? item.alt} loading="eager" decoding="async" draggable={false} />
          ) : (
            <span title={item.title}>{item.node}</span>
          )}
        </li>
      ))}
    </ul>
  )), [copyCount, logos]);

  return (
    <div
      ref={containerRef}
      className={`financial-logo-loop ${fadeOut ? 'financial-logo-loop--fade' : ''} ${className}`.trim()}
      style={style}
      role="region"
      aria-label={ariaLabel}
    >
      <div ref={trackRef} className="financial-logo-loop__track">
        {lists}
      </div>
    </div>
  );
}

export default memo(LogoLoop);
