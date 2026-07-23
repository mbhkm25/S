# SANAD Business Public Profile Modes v1

## Scope

This release adds a small adaptive presentation layer for public business profiles before launch.

## Included

- Profile modes: products, services, appointments, menu, portfolio, custom.
- Configurable primary visitor action.
- Backward-compatible database defaults.
- Dynamic public profile overview and tabs.
- Empty-section suppression.
- Open/closed state, share action, and copyable financial accounts.
- Skeleton-first loading and deferred catalog image loading.
- Management UI for choosing profile mode and primary action.

## Deferred

- Business AI assistant.
- Full booking engine.
- Cart, orders, and payments.
- Advanced template builder.
- External source ingestion.

## Migration

`supabase/migrations/20260723090000_business_public_profile_modes_v1.sql`

The migration has been applied to the production Supabase project and is backward compatible with existing published profiles.
