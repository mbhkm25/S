(() => {
  'use strict';

  const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toLatinDigits(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
  }

  function normalizeTextNode(node) {
    const current = node.nodeValue || '';
    const normalized = toLatinDigits(current);
    if (normalized !== current) node.nodeValue = normalized;
  }

  function normalizeElement(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(root);
      return;
    }

    if (!(root instanceof Element) && root !== document) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) normalizeTextNode(node);

    if (root instanceof Element) {
      root.querySelectorAll('input, textarea').forEach(control => {
        const normalized = toLatinDigits(control.value);
        if (normalized !== control.value) control.value = normalized;
      });
    }
  }

  function boot() {
    document.documentElement.dataset.numerals = 'latin';
    normalizeElement(document.body);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') normalizeTextNode(mutation.target);
        mutation.addedNodes.forEach(normalizeElement);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('input', event => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) return;
      const normalized = toLatinDigits(control.value);
      if (normalized !== control.value) control.value = normalized;
    }, true);
  }

  window.SANAD_DISPLAY_STANDARDS = Object.freeze({ toLatinDigits, normalizeElement });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
