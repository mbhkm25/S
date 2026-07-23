const PROFILE_ROOT_SELECTOR = 'div[dir="rtl"]:has(> header + nav + main), div[dir="rtl"]:has(> div > button)';
const TOAST_ID = 'sanad-public-profile-share-toast';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getShareTitle(root: Element): string {
  const heading = root.querySelector('h1');
  return heading?.textContent?.trim() || document.title || 'سند';
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.insetInlineStart = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to the legacy fallback for constrained browsers/webviews.
    }
  }
  return legacyCopy(text);
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  document.getElementById(TOAST_ID)?.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    insetInline: '16px',
    bottom: 'calc(88px + env(safe-area-inset-bottom))',
    zIndex: '2147483647',
    maxWidth: '420px',
    marginInline: 'auto',
    padding: '12px 16px',
    borderRadius: '16px',
    background: tone === 'success' ? 'rgba(6, 78, 59, .96)' : 'rgba(127, 29, 29, .96)',
    color: '#fff',
    boxShadow: '0 18px 44px rgba(15, 23, 42, .22)',
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'center',
    direction: 'rtl',
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'opacity 180ms ease, transform 220ms cubic-bezier(.22,1,.36,1)'
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function isProfileShareButton(target: EventTarget | null): { button: HTMLButtonElement; root: Element } | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return null;

  const root = button.closest(PROFILE_ROOT_SELECTOR);
  if (!root) return null;

  const header = button.closest('header');
  if (header && header.lastElementChild === button) return { button, root };

  const icon = button.querySelector('svg');
  const label = button.getAttribute('aria-label') || button.getAttribute('title') || '';
  if (icon && /مشارك|share/i.test(label)) return { button, root };

  const parent = button.parentElement;
  if (parent?.classList.contains('absolute') && parent.querySelectorAll(':scope > button').length === 2 && parent.lastElementChild === button) {
    return { button, root };
  }

  return null;
}

async function shareProfile(root: Element) {
  const url = window.location.href;
  const title = getShareTitle(root);

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return;
    } catch (error) {
      if (isAbortError(error)) return;
    }
  }

  const copied = await copyText(url);
  showToast(copied ? 'تم نسخ رابط النشاط' : 'تعذر نسخ الرابط من هذا المتصفح', copied ? 'success' : 'error');
}

function handleShareClick(event: MouseEvent) {
  const match = isProfileShareButton(event.target);
  if (!match) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  match.button.disabled = true;
  void shareProfile(match.root).finally(() => {
    window.setTimeout(() => {
      match.button.disabled = false;
    }, 250);
  });
}

document.addEventListener('click', handleShareClick, true);
