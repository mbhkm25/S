type HistoryMethod = 'pushState' | 'replaceState';

const SCROLL_CONTAINER_SELECTORS = [
  '[data-app-scroll-container]',
  '[data-scroll-root]'
];

function resetScrollPosition(): void {
  const run = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    for (const selector of SCROLL_CONTAINER_SELECTORS) {
      document.querySelectorAll<HTMLElement>(selector).forEach(element => {
        element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    }
  };

  // First frame handles the history mutation; the second waits for the new
  // screen to mount so lazy routes cannot restore the previous page position.
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function installHistoryMethodReset(method: HistoryMethod): void {
  const historyObject = window.history as History & Record<string, unknown>;
  const marker = `__sanad_${method}_scroll_reset_installed`;
  if (historyObject[marker]) return;

  const original = history[method].bind(history);
  history[method] = ((...args: Parameters<History[HistoryMethod]>) => {
    const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const result = original(...args);
    const after = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (before !== after) resetScrollPosition();
    return result;
  }) as History[HistoryMethod];

  historyObject[marker] = true;
}

export function installNavigationScrollReset(): void {
  if (typeof window === 'undefined') return;

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  installHistoryMethodReset('pushState');
  installHistoryMethodReset('replaceState');
  window.addEventListener('popstate', resetScrollPosition);

  // A direct route load must also begin from the top, including PWA restores.
  resetScrollPosition();
}

installNavigationScrollReset();
