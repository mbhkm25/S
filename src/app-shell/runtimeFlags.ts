function envBoolean(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const SANAD_APP_SHELL_V2_ENABLED = envBoolean(
  (import.meta as any).env?.VITE_SANAD_APP_SHELL_V2,
);
