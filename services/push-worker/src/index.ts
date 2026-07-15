import { ConfigError, loadConfig } from './config.js';
import { startHealthServer, type HealthServer } from './health.js';
import { createLogger, safeErrorCode, type Logger } from './logger.js';
import { createPushDatabase } from './supabase.js';
import { createWebPushSender } from './webPush.js';
import { PushWorker } from './worker.js';

function startupFailure(error: unknown): never {
  const code = error instanceof ConfigError ? error.code : safeErrorCode(
    error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null,
    'startup_failure'
  );
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event: 'startup_failed', error_code: code }));
  process.exit(1);
}

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try { config = loadConfig(); } catch (error) { startupFailure(error); }
  const logger: Logger = createLogger(config.workerInstanceId);
  const worker = new PushWorker({
    config,
    database: createPushDatabase(config),
    sender: createWebPushSender(config),
    logger
  });
  let health: HealthServer;
  try { health = await startHealthServer(config, worker, logger); } catch { startupFailure({ code: 'health_server_start_failed' }); }

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log('info', 'shutdown_started', { signal });
    const graceful = await worker.stop();
    try { await health.close(); } catch { exitCode = 1; }
    logger.log(graceful ? 'info' : 'error', 'shutdown_finished', { graceful });
    process.exit(graceful ? exitCode : 1);
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('uncaughtException', () => { void shutdown('uncaught_exception', 1); });
  process.once('unhandledRejection', () => { void shutdown('unhandled_rejection', 1); });

  await worker.start();
  if (worker.state().configurationFailure) {
    logger.log('error', 'configuration_circuit_open');
  }
}

void main().catch(startupFailure);
