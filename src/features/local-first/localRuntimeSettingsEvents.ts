export const OPEN_LOCAL_RUNTIME_SETTINGS_EVENT = 'sanadOpenLocalRuntimeSettings';

export function openLocalRuntimeSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_LOCAL_RUNTIME_SETTINGS_EVENT));
}
