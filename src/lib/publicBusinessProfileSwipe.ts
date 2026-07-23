const PROFILE_ROOT_SELECTOR = 'div[dir="rtl"]:has(> header + nav + main)';
const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-profile-swipe]';
const SWIPE_THRESHOLD = 58;
const AXIS_LOCK_DISTANCE = 10;
const HORIZONTAL_BIAS = 1.15;
const MAX_DRAG_PREVIEW = 52;

type SwipeState = {
  pointerId: number;
  root: HTMLElement;
  panel: HTMLElement;
  startX: number;
  startY: number;
  lastX: number;
  axis: 'pending' | 'horizontal' | 'vertical';
};

let activeSwipe: SwipeState | null = null;

function getProfileRoot(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const main = target.closest('main');
  if (!main) return null;
  const root = main.closest(PROFILE_ROOT_SELECTOR);
  return root instanceof HTMLElement ? root : null;
}

function getPanel(root: HTMLElement): HTMLElement | null {
  const panel = root.querySelector(':scope > main > div');
  return panel instanceof HTMLElement ? panel : null;
}

function getTabButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll(':scope > nav button')).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement
  );
}

function getActiveTabIndex(buttons: HTMLButtonElement[]): number {
  const index = buttons.findIndex(button => button.querySelector(':scope > span'));
  return index >= 0 ? index : 0;
}

function resetPanel(panel: HTMLElement) {
  panel.style.transition = 'transform 180ms cubic-bezier(.22,1,.36,1), opacity 180ms ease';
  panel.style.transform = '';
  panel.style.opacity = '';
  window.setTimeout(() => {
    panel.style.transition = '';
  }, 190);
}

function settleSwipe(state: SwipeState, deltaX: number) {
  const buttons = getTabButtons(state.root);
  const activeIndex = getActiveTabIndex(buttons);
  const direction = deltaX < 0 ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(activeIndex + direction, buttons.length - 1));

  if (Math.abs(deltaX) < SWIPE_THRESHOLD || nextIndex === activeIndex) {
    resetPanel(state.panel);
    return;
  }

  const exitX = direction > 0 ? -72 : 72;
  state.panel.style.transition = 'transform 170ms cubic-bezier(.4,0,.2,1), opacity 150ms ease';
  state.panel.style.transform = `translate3d(${exitX}px, 0, 0)`;
  state.panel.style.opacity = '0.25';

  window.setTimeout(() => {
    state.panel.style.transition = '';
    state.panel.style.transform = '';
    state.panel.style.opacity = '';
    buttons[nextIndex]?.click();
    buttons[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 150);
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_SELECTOR)) return;

  const root = getProfileRoot(event.target);
  if (!root) return;
  const panel = getPanel(root);
  if (!panel) return;

  activeSwipe = {
    pointerId: event.pointerId,
    root,
    panel,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    axis: 'pending'
  };
}

function handlePointerMove(event: PointerEvent) {
  const state = activeSwipe;
  if (!state || state.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - state.startX;
  const deltaY = event.clientY - state.startY;
  state.lastX = event.clientX;

  if (state.axis === 'pending' && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= AXIS_LOCK_DISTANCE) {
    state.axis = Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS ? 'horizontal' : 'vertical';
  }

  if (state.axis !== 'horizontal') return;
  event.preventDefault();

  const previewX = Math.max(-MAX_DRAG_PREVIEW, Math.min(MAX_DRAG_PREVIEW, deltaX * 0.32));
  const progress = Math.min(1, Math.abs(deltaX) / 180);
  state.panel.style.transition = 'none';
  state.panel.style.transform = `translate3d(${previewX}px, 0, 0) rotateY(${previewX * -0.035}deg)`;
  state.panel.style.opacity = String(1 - progress * 0.18);
}

function finishPointer(event: PointerEvent) {
  const state = activeSwipe;
  if (!state || state.pointerId !== event.pointerId) return;
  activeSwipe = null;

  if (state.axis !== 'horizontal') {
    resetPanel(state.panel);
    return;
  }

  settleSwipe(state, state.lastX - state.startX);
}

function handlePointerCancel(event: PointerEvent) {
  const state = activeSwipe;
  if (!state || state.pointerId !== event.pointerId) return;
  activeSwipe = null;
  resetPanel(state.panel);
}

document.addEventListener('pointerdown', handlePointerDown, { passive: true });
document.addEventListener('pointermove', handlePointerMove, { passive: false });
document.addEventListener('pointerup', finishPointer, { passive: true });
document.addEventListener('pointercancel', handlePointerCancel, { passive: true });
