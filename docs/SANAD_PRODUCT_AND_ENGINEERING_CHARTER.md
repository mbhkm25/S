# SANAD Product and Engineering Charter

This charter defines SANAD's product philosophy, engineering boundaries, architecture principles, and implementation guardrails. It is intended to guide human contributors and AI agents working on the SANAD repository.

## Product Identity

SANAD is not a store, marketplace, ERP, wallet, bank, or banking application.

SANAD is a financial trust layer above WhatsApp and web/PWA flows. It helps users verify, organize, confirm, and review financial notices.

SANAD's core responsibilities are:

- Receive financial notices from supported intake channels.
- Extract structured transaction data from those notices.
- Match notices to verified identities and accounts.
- Store financial operation records.
- Send or prepare confirmations.
- Link financial operations to business context.
- Maintain trusted business profiles and business relationships.

SANAD should stay focused on trust, verification, identity, financial notice handling, and operational review.

## Business Layer Philosophy

A SANAD user is always an individual.

A business profile is an independent entity owned by a user. The user's relationship to the business determines what they can do.

Correct role model:

- `owner`: manages the business profile.
- `team_member`: can link or handle operations according to permissions.
- `customer`: is linked to the business as a customer.

Roles must come from relationship records, not from a shortcut on the user record.

Do not introduce `user_type` as a role shortcut. It hides the actual relationship model and will create authorization drift.

## Catalog Philosophy

Do not rebuild an internal SANAD catalog for the MVP.

Do not add these inside SANAD MVP:

- Products.
- Prices.
- Cart.
- Inventory.
- Checkout.
- Order management.
- Product images.
- Product inquiries.

WhatsApp Business Catalog remains the catalog surface. WhatsApp remains the communication, catalog, order, and product browsing channel.

SANAD may store `business_profiles.whatsapp_catalog_url`.

The UI may expose a button or link to the WhatsApp Business Catalog from the public business profile.

Internal catalog tables, functions, or legacy code paths, if present, are reserved for a possible future decision. They must not be reactivated without explicit product and engineering approval.

## Media Philosophy

Business media in SANAD is identity and trust media only.

Supported active media types:

- `cover`
- `profile`
- `gallery`

Do not use `catalog` as an active media asset type in the UI.

Do not implement product images for the MVP.

Business media should help customers recognize and trust a business profile. It should not turn SANAD into a product showcase.

## Financial Operation Philosophy

The central object in SANAD is the financial operation or notice.

Operations may be received through:

- WhatsApp flows.
- Upload.
- Share target.
- Web/PWA intake.

AI extraction should produce structured transaction fields such as entity, amount, currency, date/time, account references, sender/receiver, and operation status when available.

Operations may be matched to verified identities and accounts.

Operations may be linked to business profiles.

SANAD should help users:

- Verify notices.
- Organize operation records.
- Confirm received or matched operations.
- Review financial activity.
- Understand the business context around a financial notice.

## Architecture Guardrails

Supabase is the source of truth for core data.

n8n may be used for automation and integration, but it must not become the source of truth for core SANAD records.

Frontend code must use anon/auth-safe clients only.

Never put `service_role` keys, admin keys, private credentials, or secrets in frontend code.

Database changes must be delivered as migrations.

If a direct Supabase change is made during emergency verification or debugging, the matching migration must be added to the repository immediately and the change must be documented.

Public RPCs must be reviewed carefully for RLS behavior, exposed data, and security-definer risks.

Storage policies must prioritize security. Any temporary stability exception must be documented with the reason and intended future hardening direction.

Do not route critical product behavior through n8n if the product requires durable source-of-truth semantics.

## Frontend Guardrails

Arabic RTL and mobile-first UX are mandatory.

The UI should be simple, operational, and trust-focused.

Use Latin digits `0-9` in displayed numbers.

Avoid feature bloat.

Do not introduce marketplace, store, product catalog, cart, checkout, order, or shop language for SANAD business profiles.

Do not make the business profile look like an e-commerce shop.

Keep WhatsApp as the communication and catalog channel.

Keep SANAD as the verification, trust, operation record, and reporting channel.

Do not change working upload, share, report, or AI intake flows without a clear reason and explicit scope.

## Supabase and RPC Guardrails

Public business profile RPCs should expose only intentionally public data.

Private business, customer, team, invitation, and operation data must remain protected.

`business_categories.name_ar` is the current Arabic category label field. Do not assume a `name` column exists.

Public business profile responses may include:

- Public identity fields.
- `profile_image_path`.
- `cover_image_path`.
- `gallery_paths`.
- `whatsapp_catalog_url`.
- Minimal category display metadata.

For the MVP, public business RPCs may return `catalog_items = []` to preserve response shape while making clear that internal SANAD catalog items are inactive.

`whatsapp_catalog_url` is the approved catalog path for MVP.

## Security Guardrails

Never expose `service_role` or admin secrets in frontend code.

Do not weaken RLS silently.

Do not create broad public access policies without documenting the reason.

Avoid `SECURITY DEFINER` unless necessary. If it is used, document why, keep returned data minimal, and review grants and execution exposure.

Public profile data must be intentionally public and minimal.

Private business, customer, team, invitation, and operation data must remain protected.

Authorization should follow relationship records:

- Business owner checks through ownership.
- Team access through team membership.
- Customer access through customer links.

Do not rely on user-editable metadata for authorization decisions.

## Development Workflow

Never work directly on `main`.

Use a dedicated branch per task.

Open a PR for review.

Do not merge without explicit approval.

Every task must end with build verification:

```powershell
npm.cmd run build
```

For Android-related changes, also verify:

```powershell
npm run build:android
npx cap sync android
gradlew assembleDebug
```

Do not run Android or Gradle workflows unless Android changes were requested or explicitly approved.

Document important decisions in `docs/`.

## Change Control

Before starting a new implementation task, state:

- The short plan.
- Expected files to touch.
- Expected tables, RPCs, storage buckets, or Edge Functions to touch.
- Whether the task is documentation-only, frontend-only, database-related, or Android-related.

Only execute after the scope is clear.

Do not modify Supabase functions, storage policies, Edge Functions, database schema, Android files, or package metadata unless the task explicitly requires it.

Do not merge a PR into `main` without explicit approval.

## MVP Boundary Summary

SANAD MVP owns:

- Financial notice intake.
- AI-assisted structured extraction.
- Verification and identity matching.
- Financial operation records.
- Business profiles.
- Business teams and customers.
- Linking operations to business context.
- Public business profile trust presentation.
- WhatsApp Business Catalog link exposure.

SANAD MVP does not own:

- Internal product catalog.
- Storefront.
- Marketplace discovery of products.
- Product inventory.
- Cart.
- Checkout.
- Order management.
- Wallet or banking ledger.
- ERP workflows.

When in doubt, keep SANAD as the trust layer and keep commerce/catalog activity in WhatsApp Business.
