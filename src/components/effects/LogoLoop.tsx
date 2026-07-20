import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './LogoLoop.css';

type LogoItem =
  | { src: string; alt: string; title?: string }
  | { node: ReactNode; title?: string; ariaLabel?: string };

type LogoLoopProps = {
  logos: LogoItem[];
  speed?: number;
  direction?: 'left' | 'right';
  logoHeight?: number;
  gap?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  scaleOnHover?: boolean;
  ariaLabel?: string;
  className?: string;
};

type LogoLoopStyle = CSSProperties & {
  '--logoloop-gap': string;
  '--logoloop-logo-height': string;
  '--logoloop-duration': string;
  '--logoloop-fade-color'?: string;
};

function LogoLoop({
  logos,
  speed = 42,
  direction = 'left',
  logoHeight = 34,
  gap = 28,
  fadeOut = true,
  fadeOutColor = '#f7f8fa',
  scaleOnHover = false,
  ariaLabel = 'الجهات المالية المدعومة',
  className = ''
}: LogoLoopProps) {
  const sequenceRef = useRef<HTMLUListElement | null>(null);
  const [sequenceWidth, setSequenceWidth] = useState(0);

  const updateWidth = useCallback(() => {
    setSequenceWidth(Math.ceil(sequenceRef.current?.getBoundingClientRect().width || 0));
  }, []);

  useEffect(() => {
    updateWidth();
    const sequence = sequenceRef.current;
    if (!sequence) return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(sequence);
    const images = Array.from(sequence.querySelectorAll('img'));
    images.forEach((image) => {
      image.addEventListener('load', updateWidth, { once: true });
      image.addEventListener('error', updateWidth, { once: true });
    });
    window.addEventListener('resize', updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [updateWidth]);

  const duration = Math.max(16, sequenceWidth / Math.max(1, speed));
  const style: LogoLoopStyle = {
    '--logoloop-gap': `${gap}px`,
    '--logoloop-logo-height': `${logoHeight}px`,
    '--logoloop-duration': `${duration}s`,
    '--logoloop-fade-color': fadeOutColor
  };

  const renderSequence = useCallback((copyIndex: number) => (
    <ul
      className="financial-logo-loop__sequence"
      key={copyIndex}
      ref={copyIndex === 0 ? sequenceRef : undefined}
      aria-hidden={copyIndex > 0}
    >
      {logos.map((item, itemIndex) => (
        <li className="financial-logo-loop__item" key={`${copyIndex}-${itemIndex}`}>
          {'src' in item ? (
            <img src={item.src} alt={copyIndex === 0 ? item.alt : ''} title={item.title} draggable={false} decoding="async" />
          ) : (
            <span aria-label={copyIndex === 0 ? item.ariaLabel || item.title : undefined} aria-hidden={copyIndex > 0 || undefined}>
              {item.node}
            </span>
          )}
        </li>
      ))}
    </ul>
  ), [logos]);

  const copies = useMemo(() => [0, 1, 2].map(renderSequence), [renderSequence]);

  return (
    <div
      className={`financial-logo-loop ${fadeOut ? 'financial-logo-loop--fade' : ''} ${scaleOnHover ? 'financial-logo-loop--scale' : ''} ${direction === 'right' ? 'financial-logo-loop--right' : ''} ${className}`.trim()}
      style={style}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="financial-logo-loop__track">{copies}</div>
    </div>
  );
}

export default memo(LogoLoop);
