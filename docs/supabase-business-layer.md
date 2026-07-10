# Supabase Business Layer

This document records the current SANAD MVP business-layer contract as used by the frontend.

## Core Tables

- `business_workspaces`: internal operational workspace owned by an individual user.
- `business_workspace_members`: workspace membership for owners and team members.
- `business_workspace_financial_accounts`: operational financial-account references linked to a workspace.
- `business_profiles`: public and private business profile metadata.
- `business_team_members`: team membership and roles for a business.
- `business_customers`: user-to-business customer relationships.
- `business_invitations`: pending and completed team invitations.
- `business_operation_links`: links between financial operations and businesses.
- `business_media_assets`: metadata for uploaded business media.

## Business Workspace Foundation

`business_workspaces` is the internal operations layer for a business owner and their team. It is separate from the public business profile:

- The workspace owns operational concepts such as team access and financial-account references.
- `business_profiles.workspace_id` links the public profile to its internal workspace.
- Existing `business_profiles.id` flows remain supported for backwards compatibility.
- Customers stay linked through `business_customers`; they do not receive workspace access.
- Owners and active team members are represented in `business_workspace_members`.

The first workspace migration backfills one workspace per existing `business_profiles` row, links the profile to that workspace, and creates owner/team workspace membership from the existing profile owner and `business_team_members` records.

Workspace RLS uses two narrow `SECURITY DEFINER` helper functions:

- `is_business_workspace_owner(workspace_id)`
- `is_business_workspace_member(workspace_id)`

They return booleans only, are granted to `authenticated`, and exist to avoid recursive RLS policies when checking membership across workspace tables.

The corresponding migration is:

- `supabase/migrations/20260709_business_workspace_foundation.sql`

## WhatsApp Catalog Pivot

SANAD does not provide an internal catalog or marketplace in the current MVP.

The supported catalog path is:

- `business_profiles.whatsapp_catalog_url`

The public business profile may show a button that opens the business's WhatsApp Business catalog when this field is present.

Internal catalog features are disabled and reserved for possible future use only. The frontend must not route users to internal catalog management, create internal catalog items, upload catalog images, show internal prices, or collect internal catalog inquiries.

## Business Media

The business media bucket is:

- `business-media`

Current frontend media asset types are:

- `cover`
- `profile`
- `gallery`

The frontend must not upload `catalog` media assets.

The current `business-media` storage policy is a temporary wartime policy kept simple to preserve upload reliability. It should be hardened later without breaking the current cover/profile/gallery upload flow.

## Profile Updates

Business profile text metadata is saved directly through the `update_business_profile` RPC from the frontend.

The frontend should not route business profile saving through the `sanad-v3-business-actions` Edge Function at this stage because that path previously failed for `update_business_profile`.

No service role keys, secrets, or private credentials should be added to this repository.

## Public Business RPCs

Public business discovery and profile display are served through two RPCs:

- `get_public_business_profile(p_slug text)`
- `get_public_businesses(p_search, p_category_id, p_governorate, p_city, p_limit, p_offset)`

Both RPCs read published rows from `business_profiles` and join `business_categories` only for category display metadata. The category label must use `business_categories.name_ar`; `business_categories.name` is not part of the current schema.

`get_public_business_profile` returns the public profile payload used by `/b/:slug`, including:

- `profile_image_path`
- `cover_image_path`
- `gallery_paths`
- `whatsapp_catalog_url`
- `category_name`
- `catalog_items`

`catalog_items` is intentionally returned as an empty array (`[]`) in the MVP. SANAD does not expose an internal product catalog, product prices, product images, or product inquiries. `business_profiles.whatsapp_catalog_url` is the approved replacement for the internal catalog path and is rendered as the WhatsApp Business catalog action in the public profile.

`get_public_businesses` returns the public business list used by the business community. Its list payload includes both `profile_image_path` and `logo_url`, where `logo_url` is resolved from `coalesce(profile_image_path, logo_path)`. This keeps older `logo_path` data readable while allowing the current profile media flow to use `profile_image_path`.

The corresponding migration is:

- `supabase/migrations/20260709_business_public_profiles_whatsapp_catalog.sql`
