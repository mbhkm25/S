import SanadIntelligenceMark from './SanadIntelligenceMark';
import {
  getSanadAssistantStateLabel,
  type SanadAssistantPresentationState,
} from './sanadAssistantPresentation';

type Props = {
  state: SanadAssistantPresentationState;
  showMark?: boolean;
  size?: number;
  className?: string;
  announce?: boolean;
};

export default function SanadAssistantStatus({
  state,
  showMark = false,
  size = 20,
  className = '',
  announce = false,
}: Props) {
  const label = getSanadAssistantStateLabel(state);

  return (
    <span
      data-sanad-assistant-status={state}
      className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-500 ${className}`}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
    >
      {showMark ? <SanadIntelligenceMark state={state} size={size} /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
