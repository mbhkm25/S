export function logAuthDiagnostic(category: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[Auth] ${category}`, error);
  }
}
