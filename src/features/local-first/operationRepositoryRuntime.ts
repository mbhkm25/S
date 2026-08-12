import { cloudOperationRepository } from './cloudOperationRepository';
import type { OperationRepository, OperationRepositoryMode } from './operationRepository';

/**
 * Single runtime switch for operation persistence.
 *
 * Phase 1 intentionally keeps Cloud as the only selectable implementation so
 * introducing the repository boundary cannot change production behavior.
 * Local/Hybrid implementations are enabled only after durable storage and
 * recovery tests are present.
 */
let runtimeMode: OperationRepositoryMode = 'cloud';

export function getOperationRepository(): OperationRepository {
  switch (runtimeMode) {
    case 'cloud':
      return cloudOperationRepository;
    case 'local':
    case 'hybrid':
      // Fail closed while Local durability is not implemented. Never silently
      // fall back to Cloud because that could upload a document the user
      // expected to remain local.
      throw new Error(`SANAD operation repository mode ${runtimeMode} is not enabled yet.`);
    default: {
      const exhaustive: never = runtimeMode;
      throw new Error(`Unsupported SANAD operation repository mode: ${String(exhaustive)}`);
    }
  }
}

export function getOperationRepositoryMode(): OperationRepositoryMode {
  return runtimeMode;
}

/**
 * Test/pilot hook only. Product UI must not toggle this directly.
 */
export function setOperationRepositoryModeForTesting(mode: OperationRepositoryMode): void {
  runtimeMode = mode;
}
