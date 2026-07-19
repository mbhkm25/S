# Supabase Edge Functions Production Audit — 2026-07-19

Project: `sanad_verify_v3`  
Project ref: `hudbzlgclghlhazlduas`  
Application: `https://app.sanadflow.com`  
API custom domain: `https://api.sanadflow.com`

## Scope

This audit compares the production Edge Function inventory with the GitHub repository, reviews `verify_jwt` boundaries, inspects recent runtime logs, and verifies execution grants for critical database RPCs.

## Production inventory

| Function | Production `verify_jwt` | Repository status at audit time | Assessment |
|---|---:|---|---|
| `sanad-file-access` | `true` after audit fix | Tracked during audit | Authenticated user function |
| `sanad-v3-analyze-operation` | `false` | Missing | Internal function; source must be synchronized |
| `sanad-v3-whatsapp-intake` | `false` | Tracked | Meta webhook; custom verification is required |
| `sanad-pro-payment-verify` | `false` | Missing | Internal function; source and custom auth must be reviewed |
| `sanad-v3-notify-verification` | `false` | Tracked | Internal-key protected |
| `sanad-v3-process-report` | `false` | Tracked | Internal report processor |
| `sanad-v3-app-trigger-analysis` | `true` | Missing | Authenticated application gateway |
| `sanad-v3-app-trigger-report` | `true` | Missing | Authenticated application gateway |
| `sanad-v3-app-trigger-notify-verification` | `true` | Missing | Authenticated application gateway |
| `sanad-v3-app-trigger-pro-payment-verify` | `true` | Missing | Authenticated application gateway |
| `sanad-v3-business-actions` | `true` | Missing | Authenticated application function |
| `sanad-v3-retry-report-delivery` | `true` | Tracked during audit | Disabled endpoint returning HTTP 410 |

## Orphan deployment

Production also contains an active function with slug `hyper-responder`, display name `sanad-file-access`, and `verify_jwt=true`. Its source is a generic hello-world template and it is not part of the SANAD application architecture. It should be deleted after a final reference and traffic check.

## Security correction applied

### `sanad-file-access`

Before the audit:

- the deployed source was absent from GitHub;
- `verify_jwt` was disabled;
- the body accepted a `public_token` and used the service-role client to generate a signed Storage URL;
- possession of the token could therefore bypass the authenticated `open_operation_access` gate.

Audit correction:

- restored the deployed source to `supabase/functions/sanad-file-access/index.ts`;
- redeployed the function as version 17 with `verify_jwt=true`;
- preserved the existing file lookup, token status, expiry, and five-minute signed URL behavior.

The SANAD frontend already sends the current user session when invoking this function.

## Database RPC review

The following production grants were verified:

| RPC | anon | authenticated | service_role | Security definer/search path |
|---|---:|---:|---:|---|
| `open_operation_access` | no | yes | yes | hardened |
| `get_my_operations` | no | yes | yes | explicit search path |
| `verify_operation` | no | yes | yes | hardened |
| `create_business_report_request` | no | yes | yes | hardened |
| `get_verification_notification_payload` | no | no | yes | hardened |

No grant correction was required for these RPCs.

## Runtime log review

Recent production logs show successful responses for:

- WhatsApp intake;
- operation analysis;
- authenticated analysis gateway;
- report gateway and processor;
- verification notification gateway and processor;
- file access before the audit deployment.

No recurring `5xx` response pattern was identified in the inspected Edge Function log window. Expected diagnostic responses such as webhook verification `403`, internal-key test `401`, and the disabled retry endpoint `410` are not production failures.

## Remaining drift to close

1. Restore the exact deployed source for every production function currently missing from GitHub.
2. Review custom authentication inside every `verify_jwt=false` internal function before any redeployment.
3. Remove the orphan `hyper-responder` deployment after confirming zero references and traffic.
4. Add a reproducible Supabase function configuration file or deployment manifest that records the intended `verify_jwt` value for each function.
5. Add an automated source/hash inventory check to release validation.
6. Test authenticated open/download behavior for `sanad-file-access` after version 17 deployment.

## Release rule

Do not redeploy an untracked production function from a guessed or reconstructed implementation. First download the currently deployed source, commit it unchanged, compare authentication boundaries, then make controlled changes with an explicit test and rollback path.
