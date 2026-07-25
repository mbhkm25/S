// Runtime compatibility helpers for older Android WebViews and browsers.
// Some environments expose window.crypto but do not implement crypto.randomUUID().

function fallbackRandomUuid(): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = new Uint8Array(16);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const seed = `${Date.now()}-${performance.now?.() || 0}-${Math.random()}`;
    for (let index = 0; index < bytes.length; index += 1) {
      const source = seed.charCodeAt(index % seed.length) || 0;
      bytes[index] = (source + Math.floor(Math.random() * 256) + index * 17) & 0xff;
    }
  }

  // RFC 4122 version 4 / variant 1 bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (globalThis.crypto && typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: fallbackRandomUuid
  });
}

export function createRuntimeUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return fallbackRandomUuid();
}
