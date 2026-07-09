# Edge Functions

This document records the Edge Functions known to the SANAD frontend.

## Known Functions

- `sanad-v3-app-trigger-analysis`
- `sanad-v3-app-trigger-pro-payment-verify`
- `sanad-v3-app-trigger-notify-verification`
- `sanad-v3-app-trigger-report`
- `sanad-v3-business-actions`

## Business Profile Save Path

`sanad-v3-business-actions` is not currently used to save business profile metadata.

Business profile saving previously failed when `update_business_profile` was routed through the Edge Function. The current frontend saves business profiles through the direct `update_business_profile` RPC instead.

Do not move business profile saving back to the Edge Function without a separate backend hardening task and verification plan.
