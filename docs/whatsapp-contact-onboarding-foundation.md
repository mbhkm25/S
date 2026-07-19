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
- `/install/`: device-aware installation guide for iPhone, Android, Samsung Internet, and standalone PWA mode.

## Security model

The two tables have RLS enabled and no client policies. `anon` and `authenticated` have no direct privileges. Operational RPCs are service-role-only.

## Idempotency

Inbound and operation events use `(event_type, external_message_id)` uniqueness. Replayed Meta webhooks do not increase counters or create duplicate lifecycle events.

## Remaining integration

The production `sanad-v3-whatsapp-intake` function must call:

1. `register_whatsapp_inbound` after validating the sender and message type.
2. `record_whatsapp_operation` after the operation row is created.
3. the isolated onboarding sender only when `should_send_welcome` is true.

The welcome sender must remain non-critical: failure must never fail file intake, QR delivery, or analysis triggering.
