type Props = {
  state?: 'idle' | 'thinking' | 'working' | 'success';
  size?: number;
  className?: string;
  label?: string;
};

export default function SanadPulseMark({
  state = 'idle',
  size = 28,
  className = '',
  label = 'سند',
}: Props) {
  const active = state === 'thinking' || state === 'working';
  return (
    <span
      className={`sanad-pulse-mark sanad-pulse-${state} inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="sanadPulseGradient" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.96" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle className="sanad-pulse-orbit" cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
        <path
          className="sanad-pulse-path"
          d="M8 25h8l4-9 7 18 5-10h8"
          fill="none"
          stroke="url(#sanadPulseGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="sanad-pulse-dot" cx="40" cy="24" r="3" fill="currentColor" />
        {active ? <circle className="sanad-pulse-core" cx="24" cy="24" r="4" fill="currentColor" opacity="0.18" /> : null}
      </svg>
    </span>
  );
}
