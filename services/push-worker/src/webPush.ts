import webpush from 'web-push';
import type { WorkerConfig } from './config.js';
import type { PushDeliveryTarget, PushSender, SendOptions, SendResult } from './types.js';

export function createWebPushSender(config: WorkerConfig): PushSender {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return {
    async send(target: PushDeliveryTarget, serializedPayload: string, options: SendOptions): Promise<SendResult> {
      const result = await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth_secret }
        },
        serializedPayload,
        {
          TTL: options.TTL,
          urgency: options.urgency,
          topic: options.topic,
          contentEncoding: target.content_encoding
        }
      );
      return { statusCode: result.statusCode };
    }
  };
}
