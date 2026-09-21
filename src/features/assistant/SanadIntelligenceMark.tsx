import type { CSSProperties } from 'react';
import type { SanadAssistantPresentationState } from './sanadAssistantPresentation';

type Props = {
  state?: SanadAssistantPresentationState;
  size?: number;
  className?: string;
  title?: string;
  monochrome?: boolean;
};

function stateAccent(state: SanadAssistantPresentationState) {
  if (state === 'success') return '#15803d';
  if (state === 'error') return '#be123c';
  if (state === 'waiting_approval') return '#a16207';
  if (state === 'listening') return '#0891b2';
  if (state === 'transcribing') return '#0f766e';
  if (state === 'executing') return '#0f766e';
  if (state === 'thinking') return '#0e7490';
  return '#0f172a';
}

export default function SanadIntelligenceMark({
  state = 'idle',
  size = 24,
  className = '',
  title,
  monochrome = false,
}: Props) {
  const accent = monochrome ? 'currentColor' : stateAccent(state);
  const style = {
    '--sanad-intelligence-accent': accent,
  } as CSSProperties;

  return (
    <span
      data-sanad-intelligence-mark
      data-assistant-state={state}
      className={`sanad-intelligence-mark sanad-intelligence-mark--${state} inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="sanad-intelligence-mark__frame">
          <path
            d="M7.1 5.6c1.15-1.5 2.85-2.35 4.9-2.35 3.45 0 6.25 2.8 6.25 6.25 0 2.05-.9 3.85-2.45 5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M16.9 18.4c-1.15 1.5-2.85 2.35-4.9 2.35-3.45 0-6.25-2.8-6.25-6.25 0-2.05.9-3.85 2.45-5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </g>

        <g className="sanad-intelligence-mark__core" stroke="var(--sanad-intelligence-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.1 8.15 12 6l3.9 2.15L12 10.3 8.1 8.15Z" />
          <path d="M8.1 15.85 12 13.7l3.9 2.15L12 18l-3.9-2.15Z" />
          <path d="M12 10.35v3.3" />
        </g>

        <circle
          className="sanad-intelligence-mark__node sanad-intelligence-mark__node--top"
          cx="12"
          cy="6"
          r="1.15"
          fill="var(--sanad-intelligence-accent)"
        />
        <circle
          className="sanad-intelligence-mark__node sanad-intelligence-mark__node--bottom"
          cx="12"
          cy="18"
          r="1.15"
          fill="var(--sanad-intelligence-accent)"
        />

        {state === 'waiting_approval' ? (
          <circle cx="18.3" cy="5.7" r="1.35" fill="none" stroke="var(--sanad-intelligence-accent)" strokeWidth="1.4" />
        ) : null}
        {state === 'success' ? (
          <path d="m16.6 6.2 1.15 1.15 2.05-2.35" stroke="var(--sanad-intelligence-accent)" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {state === 'error' ? (
          <path d="M18.2 4.9v2.25M18.2 8.7v.1" stroke="var(--sanad-intelligence-accent)" strokeWidth="1.55" strokeLinecap="round" />
        ) : null}
      </svg>
    </span>
  );
}
