# Stage 2B.0 — DB-C Connections Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## 1. Decision

The user-facing “Connections” area should unify several integration experiences, but the data architecture must distinguish three concepts:

~~~text
External Connections
Delivery Channels
Device Capabilities
~~~

Do not force all three into one table.

## 2. Existing accounting / Bridge connection

Production already has a mature business accounting connection model:
- business_accounting_connections
- business_erp_source_instances
- business_bridge_devices
- business_bridge_device_credentials
- business_bridge_pairing_tokens
- business_bridge_authorization_sessions
- ERP baseline/raw/snapshot tables

This model is business-scoped and read-only toward Edaa.

Keep it specialized.

Do not rename it into a generic connection table.

## 3. Generic connection registry

Add later a lightweight parent registry for external integrations.

Conceptual table:

sanad_connections

Suggested fields:
- id
- scope_kind: user | business
- user_id nullable
- business_id nullable
- connection_kind
- provider_code
- display_name
- status
- capabilities jsonb
- health_status
- last_connected_at
- last_sync_at
- last_error_code
- metadata
- created_at
- updated_at

Exactly one owner scope must be set.

Specialized systems keep their own tables and reference the generic connection id where useful.

## 4. Secrets

Never store provider access tokens or secrets in public connection metadata.

The project already has Supabase Vault installed.

Potential secret locations:
- Supabase Vault;
- private schema encrypted references;
- Edge Function environment for platform-owned credentials.

The public registry stores status and capability metadata only.

## 5. WhatsApp finding

SANAD already has a substantial platform WhatsApp backend:
- sanad_whatsapp_contacts
- WhatsApp contact events
- campaigns
- transactional message rules/outbox
- durable media intake
- delivery states
- WhatsApp assistant Edge Functions

The production WhatsApp intake uses platform environment credentials such as:
- META_WA_ACCESS_TOKEN
- META_WA_PHONE_NUMBER_ID
- META_APP_SECRET

Therefore current WhatsApp is a platform-owned SANAD channel, not a per-business WhatsApp Business Account connection.

## 6. Two WhatsApp concepts

### A. SANAD WhatsApp Channel

Purpose:
- receive/send SANAD service messages;
- transaction notifications;
- onboarding;
- payment notices;
- assistant interaction.

This is mainly a Delivery Channel.

It can appear in Connections UI as “WhatsApp notifications / SANAD channel” but should not pretend the user's own WhatsApp account is connected.

### B. Business WhatsApp Account — future

If a merchant later connects their own Meta WABA/phone number:
- OAuth/authorization;
- WABA identity;
- phone number id;
- webhook routing;
- permissions/scopes;
- token lifecycle;
- business ownership.

This is a true External Connection and needs a separate provider-specific adapter.

Do not reuse sanad_whatsapp_contacts as WABA credentials.

## 7. Push notifications

push_subscriptions represents Delivery Endpoints/Devices, not external business connections.

Keep it in the notification/device layer.

The Connections UI may show device notification health, but the database model remains separate.

## 8. Contacts

Phone address-book integration should begin as a Device Capability.

Do not upload the entire address book by default.

Possible phases:
1. local permission + selected-contact picker;
2. explicit link to SANAD party/customer/supplier;
3. optional user-controlled sync later.

Any cloud contact model must track:
- source;
- consent;
- normalization;
- linked SANAD entity;
- deletion/revocation.

## 9. Calling

Initial phone integration can be a deterministic OS action:

call(contact/number)

It does not require storing call history.

Call-log ingestion is a separate, higher-sensitivity capability and should be deferred until permissions/product value are explicit.

## 10. Bridge conversational setup

SANAD Desktop should become a Local Connection Host.

Target flow:

~~~text
User: اربط سند بإبداع
→ detect/install Bridge
→ authorize
→ pair business/source
→ baseline sync
→ health check
→ conversational result
~~~

Repair flow:

~~~text
User: لماذا إبداع غير متصل؟
→ device heartbeat
→ connection status
→ ERP source availability
→ credential state
→ cloud reachability
→ sync freshness
→ safe repair where allowed
~~~

The conversation invokes deterministic connection actions; it does not directly manipulate secrets.

## 11. Connection capability contract

Every external connection should eventually expose normalized capabilities such as:

- read_entities
- read_transactions
- read_documents
- send_messages
- receive_messages
- sync_contacts
- create_drafts
- write_back

Capabilities are explicit.

For Edaa, write_back remains false under current policy.

## 12. Health model

Normalize connection health without replacing provider details:

~~~text
connected
degraded
attention_required
disconnected
authorizing
~~~

Expose:
- last heartbeat;
- last sync;
- provider-specific error code;
- freshness;
- repair action.

## 13. Decision summary

~~~text
Accounting/Bridge tables       KEEP specialized
Generic connection registry    ADD later
Platform WhatsApp              Delivery channel, already exists
Business WABA connection       Future provider adapter
Push subscription              Device/delivery endpoint
Contacts                       Device capability first
Phone call                     OS action first
Secrets in public metadata     NEVER
Conversation-driven repair     TARGET
~~~
