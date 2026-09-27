// Invalidation only: canonical action data always comes from the server RPC.
const listeners = new Set<() => void>();
export function invalidateSanadActionReviews(): void { for (const listener of listeners) listener(); }
export function subscribeSanadActionReviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
