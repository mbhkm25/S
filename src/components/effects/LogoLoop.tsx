import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import Aurora from './Aurora';
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

function LogoLoop() {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const dividerContainer = anchor?.parentElement;
    const businessSection = dividerContainer?.nextElementSibling;
    if (!(businessSection instanceof HTMLElement)) return;

    const previousDisplay = dividerContainer?.style.display || '';
    if (dividerContainer) dividerContainer.style.display = 'none';
    businessSection.classList.add('business-aurora-section');
    setTarget(businessSection);

    return () => {
      if (dividerContainer) dividerContainer.style.display = previousDisplay;
      businessSection.classList.remove('business-aurora-section');
      setTarget(null);
    };
  }, []);

  return (
    <>
      <span ref={anchorRef} className="business-aurora-anchor" aria-hidden="true" />
      {target && createPortal(
        <Aurora
          colorStops={['#bbf7d0', '#bfdbfe', '#c7d2fe']}
          blend={0.78}
          amplitude={0.52}
          speed={0.18}
        />,
        target
      )}
    </>
  );
}

export default memo(LogoLoop);
