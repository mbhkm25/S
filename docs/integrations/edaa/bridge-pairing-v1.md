# SANAD Bridge Pairing v1

Status: development contract for secure one-time Bridge registration.

## Goal

Pair a Windows Bridge installation with one SANAD business/accounting connection without giving the Bridge a SANAD user password, ERP password, SQL password, service-role key or long-lived shared merchant password.

## Flow

1. The SANAD business owner creates or selects a read-only accounting connection.
2. SANAD creates a short-lived one-time pairing token for the detected ERP source instance.
3. The owner transfers that token to the Bridge installer/status app.
4. The Bridge calls `POST /functions/v1/sanad-erp-pair-v1` once.
5. The cloud validates and atomically consumes the pairing token.
6. The cloud registers a Bridge device and creates a per-device credential.
7. The Bridge receives `device_public_id` and `device_token` once.
8. The Bridge stores the device credential locally using an OS-appropriate protected-secret mechanism.
9. Future event ingestion uses the device identity, not the pairing token.

## Owner-side RPCs

### Create accounting connection

`create_business_accounting_connection_v1(business_id, provider_code, display_name, location_name)`

Current Phase-1 connections are always `read_only`.

### List connections

`get_business_accounting_connections_v1(business_id)`

Returns operational connection status, location, adapter version, last sync/heartbeat/error fields and active-device count.

### Create pairing token

`create_business_bridge_pairing_v1(connection_id, source_key, source_label, source_version, schema_fingerprint, expires_minutes)`

Rules:

- owner only;
- expiry between 2 and 30 minutes;
- returned plaintext pairing token is shown only to the caller;
- PostgreSQL stores only its SHA-256 hash and an 8-character non-secret prefix;
- the token is one-time and becomes unusable after consumption.

## Bridge-side endpoint

`POST /functions/v1/sanad-erp-pair-v1`

Example request shape:

```json
{
  "pairing_token": "<one-time-token>",
  "device_label": "Main cashier PC",
  "bridge_version": "1.0.0",
  "adapter_version": "edaa-v1"
}
```

Example response shape:

```json
{
  "ok": true,
  "device_public_id": "<uuid>",
  "device_token": "<shown-once-device-secret>",
  "connection_id": "<uuid>",
  "source_instance_id": "<uuid>",
  "contract_version": 1
}
```

The response secret must never be committed to Git, copied into SANAD frontend configuration, sent to analytics, or written to normal application logs.

## Event ingestion after pairing

The Bridge calls `sanad-erp-ingest-v1` using:

- `x-sanad-device-id: <device_public_id>`
- `x-sanad-device-token: <device_token>`

The cloud hashes the presented device token and compares it with the stored SHA-256 hash. Ordinary authenticated SANAD users have no direct table access to device credentials or raw ERP events.

## Revocation model

Device credentials are scoped to one Bridge device. The device can later be paused/revoked independently without affecting other devices, sources or businesses.

Pairing tokens are not reusable device credentials and must never be used for event ingestion.

## Verification performed

On the Supabase development branch, an end-to-end rollback-safe transaction proved:

- owner accounting-connection creation;
- one-time pairing creation;
- service-side pairing consumption;
- Bridge device/credential creation;
- first ERP event acceptance;
- same-event retry without duplicate logical raw event;
- duplicate source/revision handling;
- ERP Party resolution;
- canonical business activity recording;
- authorized owner timeline read.

The test transaction was rolled back, so it left no fake business/user/ERP data behind.
