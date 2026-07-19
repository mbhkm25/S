# WhatsApp contact onboarding foundation

## Product contract

A WhatsApp sender is stored as a SANAD WhatsApp contact, not as an authentication account. The contact may later be linked to a registered profile when the verified phone number matches.

## Implemented foundation

- `sanad_whatsapp_contacts`: canonical WhatsApp-only contact record.
- `sanad_whatsapp_contact_events`: idempotent lifecycle events.
- `register_whatsapp_inbound(...)`: records one inbound message exactly once.
- `record_whatsapp_operation(...)`: associates a successful operation exactly once and returns `should_send_welcome` for the first successful operation.
- `mark_whatsapp_welcome_result(...)`: records queued, sent, and failed welcome delivery states.
- profile trigger: links an existing WhatsApp contact to a registered SANAD profile with the same normalized Yemen phone number.
- operations trigger: captures every new WhatsApp operation without blocking intake and queues the first successful sender for onboarding.
- `claim_whatsapp_welcome_batch(...)`: atomically claims queued contacts with `FOR UPDATE SKIP LOCKED` and prevents duplicate concurrent sends.
- `release_stale_whatsapp_welcome_claims(...)`: safely returns abandoned sending claims to the queue.
- `/install/`: device-aware installation guide for iPhone, Android, Samsung Internet, WhatsApp in-app browser, and standalone PWA mode.

## Security model

The two tables have RLS enabled and no client policies. `anon` and `authenticated` have no direct privileges. Operational RPCs are service-role-only.

## Idempotency

Inbound and operation events use `(event_type, external_message_id)` uniqueness. Replayed Meta webhooks do not increase counters or create duplicate lifecycle events. Welcome queue claims are atomic, so a second worker receives an empty batch while the first claim is active.

## Production migrations

The following migrations have been applied successfully to production:

- `whatsapp_contact_tables`
- `whatsapp_contact_rpcs`
- `whatsapp_contact_profile_linking`
- `whatsapp_operation_contact_queue`
- `whatsapp_welcome_queue_claim`

## Verification

Database tests confirmed:

- duplicate inbound and operation events increment counters once only;
- the first queue claim returns one contact;
- an immediate second claim returns zero contacts;
- test contacts and events were removed after verification.

## Remaining integration

The isolated sender function `sanad-v3-whatsapp-onboarding` must be deployed with the existing Meta and SANAD internal secrets. It will:

1. require `x-sanad-internal-key`;
2. release stale claims;
3. claim a small queued batch;
4. send the approved welcome text with the `/install/` link;
5. record `sent` or `failed` without affecting operation intake, QR delivery, or analysis.

The production `sanad-v3-whatsapp-intake` remains unchanged until the isolated sender has passed a one-number test. This preserves the current working upload path.