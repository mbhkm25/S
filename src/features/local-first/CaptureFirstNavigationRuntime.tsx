import { useEffect } from 'react';

const DIRECT_CAPTURE_KEY = 'sanad_direct_capture_once';
const DIRECT_CAPTURE_EVENT = 'sanadDirectCaptureRequested';

function markDirectCaptureRequested() {
  try {
    sessionStorage.setItem(DIRECT_CAPTURE_KEY, String(Date.now()));
  } catch {
    // The event below still gives an already-mounted upload screen a chance to react.
  }
  window.setTimeout(() => window.dispatchEvent(new Event(DIRECT_CAPTURE_EVENT)), 0);
}

function configureBottomCaptureAction() {
  const nav = document.getElementById('bottom_nav');
  if (!nav) return;

  const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button'));
  const captureButton = buttons.find((button) => {
    const text = button.textContent || '';
    return text.includes('إضافة عملية') || text.includes('تصوير إشعار');
  });
  if (!captureButton) return;

  const labels = Array.from(captureButton.querySelectorAll<HTMLElement>('span'));
  const label = labels.find((candidate) => {
    const text = candidate.textContent?.trim();
    return text === 'إضافة عملية' || text === 'تصوير إشعار';
  });
  if (label && label.textContent !== 'تصوير إشعار') label.textContent = 'تصوير إشعار';
  captureButton.setAttribute('aria-label', 'تصوير إشعار مالي بالكاميرا');
  captureButton.title = 'تصوير إشعار';

  if (captureButton.dataset.sanadCaptureFirstBound === '1') return;
  captureButton.dataset.sanadCaptureFirstBound = '1';
  captureButton.addEventListener('click', markDirectCaptureRequested, { capture: true });
}

/**
 * Adapts the legacy bottom tab into a camera-first action without changing the
 * normal `upload` route. The Home quick action still opens the complete intake
 * screen (camera + document picker), while the bottom action marks a one-shot
 * camera intent before React navigates to that same route.
 */
export default function CaptureFirstNavigationRuntime() {
  useEffect(() => {
    configureBottomCaptureAction();
    const observer = new MutationObserver(configureBottomCaptureAction);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

export { DIRECT_CAPTURE_EVENT, DIRECT_CAPTURE_KEY };
