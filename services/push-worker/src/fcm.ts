import { createSign } from 'node:crypto';
import type { PushDeliveryTarget, PushPayload, SendOptions, SendResult } from './types.js';

export interface FcmConfig {
  projectId?: string | undefined;
  clientEmail?: string | undefined;
  privateKey?: string | undefined;
}

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

async function accessToken(config: Required<FcmConfig>): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(config.privateKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw Object.assign(new Error('fcm_oauth_failed'), { statusCode: response.status });
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(300, Number(body.expires_in || 3600)) * 1000 };
  return body.access_token;
}

function parsePayload(serialized: string): PushPayload {
  const parsed = JSON.parse(serialized) as PushPayload;
  if (!parsed || parsed.version !== 1 || !parsed.notification_id || !parsed.title || !parsed.body) {
    throw Object.assign(new Error('invalid_fcm_payload'), { statusCode: 400 });
  }
  return parsed;
}

export function createFcmSender(config: FcmConfig) {
  return {
    async send(target: PushDeliveryTarget, serializedPayload: string, options: SendOptions): Promise<SendResult> {
      const fcmToken = target.provider_token || (
        target.endpoint.startsWith('https://fcm.sanadflow.invalid/') ? target.p256dh : null
      );
      if (!fcmToken) throw Object.assign(new Error('invalid_fcm_target'), { statusCode: 400 });
      if (!config.projectId || !config.clientEmail || !config.privateKey) {
        throw Object.assign(new Error('fcm_not_configured'), { statusCode: 503 });
      }
      const payload = parsePayload(serializedPayload);
      const token = await accessToken({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey.replace(/\\n/g, '\n'),
      });
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: {
              sanad_notification_id: payload.notification_id,
              sanad_category: payload.category,
              sanad_severity: payload.severity,
              sanad_action_type: payload.action_type,
              sanad_action_payload: JSON.stringify(payload.action_payload),
              title: payload.title,
              body: payload.body,
            },
            android: {
              priority: options.urgency === 'high' ? 'HIGH' : 'NORMAL',
              ttl: `${Math.max(0, options.TTL)}s`,
              notification: { channel_id: 'sanad_operations', sound: 'default' },
            },
          },
        }),
      });
      return { statusCode: response.status };
    },
  };
}
