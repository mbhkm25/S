# SANAD Stage 2A — Production Closure Handoff

**Closure date:** 2026-09-22  
**Release train:** Stage 2A — Visual Foundation & Mobile Safe-Area Baseline  
**Status:** CLOSED

## Release references

- Stage 2A functional integration merge: `2bc2b097e7a4c5f148b3968bfb5ae1c3c3568484`
- Production release/main SHA: `d0f7ce82bdf1f3c3dc9f63b24328501098d98893`
- Production version.json: `d0f7ce82bdf1`
- Official deploy workflow run: `35769714699` — SUCCESS
- Previous Production SHA: `8ebc5f7521df2f016681f252d0c161e39e4adb7a`
- Previous PWA version: `8ebc5f7521df`

## Foundation shipped

Stage 2A shipped the common visual foundation without changing the target product architecture or starting Stage 2B:

- semantic color roles for brand, surfaces, text, borders, interaction, focus, selection, and status;
- Brand Green remains separate from Success Green;
- Noto Sans Arabic Variable remains the primary typeface with system fallbacks;
- shared typography, spacing, radius, and elevation scales;
- shared visual primitives: `SanadSurface`, `SanadSectionHeader`, `SanadStatusChip`, and `SanadIconContainer`;
- restrained section signatures under one SANAD identity;
- shell-level semantic adoption for header, SANAD workspace, Composer, sidebar/settings, navigation pilot, and representative structured response;
- dark-mode readiness only; dark mode is not shipped.

## Surface hierarchy

The intended hierarchy is:

```
Canvas
→ Workspace / Section surface only when needed
→ Structured semantic surface when it carries meaning
→ Interactive control
```

Stage 2A does not establish card nesting as a default layout mechanism.

## Safe-area contract

**Safe-Area Foundation: SHIPPED**

The shared contract uses the platform safe-area inset when provided, with a SANAD interaction/breathing floor:

```
effective bottom clearance
=
max(actual safe-area inset, SANAD design breathing floor)
```

`0.75rem` is a SANAD design breathing floor. It is **not** an Android system navigation-bar measurement.

Canonical token: `--sanad-mobile-bottom-clearance`.

**Legacy ProductBottomNav: TRANSITIONAL**

Physical legacy bottom-navigation validation was removed as a Stage 2A closure blocker because the four-section navigation is no longer the target IA.

**Physical bottom-nav validation: OBSOLETED BY STAGE 2B TARGET SHELL**

Safe-area runtime behavior must be revalidated when the Stage 2B mobile drawer/shell is implemented.

## Production verification

Production postflight verified:

- `/sanad-ai` on desktop and 390px mobile;
- timeline scroll ownership;
- Composer and assistant sidebar;
- representative customer-statement structured response;
- Noto Sans Arabic runtime font;
- semantic Stage 2A tokens in the deployed app;
- no horizontal overflow;
- `/financial`, `/commercial`, and `/account-center` smoke;
- Stage 1 message-ordering invariants remain clean;
- settings persistence data remains healthy;
- Voice remains on `sanad-voice-v2` with successful Production metrics.

Production Service Worker after Stage 2A:
`d2a76cc81d9fa4d746f4c1ef7c5d27f44f78558faa0bfe154862308848a34edc`

Previous Service Worker:
`5661b351331ba378885e16ccc00a8855304faf17de1a2b0e93000d3c6c8046f2`

The PWA update contract remains user-controlled: a waiting Service Worker raises the in-app “نسخة جديدة من سند متاحة” prompt, and activation occurs after the user selects “تحديث الآن”.

## Operational note

The repository's existing `Build SANAD Android APK` workflow is configured to publish the signed APK on a non-PR `main` event when `SANAD_ANDROID_PUBLISH_ENABLED=true`. That existing workflow ran successfully after the Stage 2A merge. Stage 2A did not change the Android release contract or introduce an Android release feature.

## Known visual debt

Accepted debt after Stage 2A:

- legacy four-section ProductBottomNav remains temporarily;
- some Financial / Commercial / Account surfaces still use legacy Slate utilities;
- full product IA migration is not part of Stage 2A;
- safe-area runtime revalidation belongs to the Stage 2B target mobile shell;
- full dark mode is not shipped;
- full product-wide semantic-token migration is deferred;
- Intelligence Mark/logo redesign is deferred.

## Next architectural stage

The next stage is:

**Stage 2B.0 — SANAD Product Model Reframe**

This is an architecture/product blueprint stage. No Stage 2B implementation is included in this closure.
