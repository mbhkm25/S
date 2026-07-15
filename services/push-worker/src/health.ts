import { createServer, type Server } from 'node:http';
import type { WorkerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { PushWorker } from './worker.js';

export interface HealthServer {
  close(): Promise<void>;
}

function writeJson(response: import('node:http').ServerResponse, status: number, body: object): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

export async function startHealthServer(config: WorkerConfig, worker: PushWorker, logger: Logger): Promise<HealthServer> {
  const server: Server = createServer((request, response) => {
    if (request.method !== 'GET') return writeJson(response, 405, { ok: false });
    if (request.url === '/health') return writeJson(response, 200, { ok: true });
    if (request.url === '/ready') {
      const state = worker.state();
      return writeJson(response, state.ready ? 200 : 503, {
        ok: state.ready,
        running: state.running,
        stopping: state.stopping,
        configuration_failure: state.configurationFailure,
        last_supabase_success_at: state.lastSupabaseSuccessAt
      });
    }
    return writeJson(response, 404, { ok: false });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.healthPort, config.healthHost, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.log('info', 'health_server_started', { host: config.healthHost, port: config.healthPort });
  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}
