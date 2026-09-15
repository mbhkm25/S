# SANAD Bridge — Windows identity bootstrap

This directory contains the first Windows-side implementation of the SANAD NEXT human-identity → device-identity authorization flow.

## Security model

The Windows Bridge **does not sign the user into Supabase directly** and does not store a SANAD access token, refresh token, password, ERP password, or SQL password.

The flow is:

1. Bridge discovers the local ERP source and generates a random device credential locally.
2. Only `SHA-256(device credential)` is sent to SANAD Cloud.
3. Cloud creates a short-lived authorization session and returns a browser URL + claim secret.
4. Bridge opens the system browser at `app.sanadflow.com/bridge/authorize`.
5. The user signs in with the normal SANAD web experience.
6. SANAD shows only businesses the user owns or businesses where `manage_accounting_integrations=true`.
7. The user chooses the SANAD business/location and explicitly authorizes the computer.
8. Bridge polls the claim endpoint. On success it receives the non-secret device identity.
9. The raw device credential never leaves the computer. It is stored with the resulting identity using Windows DPAPI (`LocalMachine`) and file ACL hardening.
10. Background ERP sync later authenticates with `device_public_id + device_token`, not the user's SANAD session.

## Identity chain

`SANAD user → business_profiles → business_locations → business_accounting_connections → business_erp_source_instances → business_bridge_devices`

The authorizing SANAD user is persisted on `business_bridge_devices.authorized_by_user_id` for auditability.

## Current executable

`bridge/windows/Sanad.Bridge` targets .NET Framework 4.8 to stay compatible with the legacy Windows/SQL Server environment already validated for Edaa Soft.

The current executable is an identity bootstrap, not yet the Windows Service/Tray production package. It demonstrates the complete authorization protocol and persists the machine identity for the upcoming Bridge service.

### Optional environment variables

- `SANAD_API_URL` — defaults to `https://api.sanadflow.com`.
- `SANAD_PUBLIC_API_KEY` — optional publishable/anon key if the gateway configuration requires an `apikey` header.

### Arguments

The first argument is the ERP `source_key`; the second is an optional display label. Production discovery will supply these automatically rather than asking the operator.

## OAuth 2.1 migration path

The database/device model deliberately does not depend on the temporary browser-session transport. Supabase OAuth 2.1 Authorization Code + PKCE can replace the browser authorization transport later by setting `authorization_method='oauth_pkce'` without changing the durable device identity or ERP ingestion contracts.
