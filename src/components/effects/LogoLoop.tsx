import { memo, useId } from 'react';
import type { ReactNode } from 'react';
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

function LogoLoop(props: LogoLoopProps) {
  const {
    ariaLabel = 'فاصل بصري متحرك بين سند المالي وسند التجاري',
    className = ''
  } = props;
  const gradientId = useId().replace(/:/g, '');
  const secondaryGradientId = useId().replace(/:/g, '');
  const glowId = useId().replace(/:/g, '');

  return (
    <div
      className={`aurora-divider ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        className="aurora-divider__svg"
        viewBox="0 0 1000 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#020617" stopOpacity="0.08" />
            <stop offset="18%" stopColor="#0f766e" />
            <stop offset="48%" stopColor="#4f46e5" />
            <stop offset="76%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id={secondaryGradientId} x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.04" />
            <stop offset="24%" stopColor="#0ea5e9" />
            <stop offset="52%" stopColor="#14b8a6" />
            <stop offset="78%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.04" />
          </linearGradient>
          <filter id={glowId} x="-15%" y="-80%" width="130%" height="260%">
            <feGaussianBlur stdDeviation="7.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          className="aurora-divider__wave aurora-divider__wave--primary"
          d="M -20 48 Q 225 -10 500 46 T 1020 48"
          stroke={`url(#${gradientId})`}
          strokeWidth="7"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
        />
        <path
          className="aurora-divider__wave aurora-divider__wave--secondary"
          d="M -20 46 Q 240 95 500 47 T 1020 46"
          stroke={`url(#${secondaryGradientId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          className="aurora-divider__highlight"
          d="M 80 47 Q 285 18 500 46 T 920 47"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default memo(LogoLoop);
