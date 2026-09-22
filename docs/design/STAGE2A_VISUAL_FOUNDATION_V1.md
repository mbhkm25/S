# SANAD Stage 2A — Visual Foundation & Mobile Safe-Area Baseline

**Release train:** Stage 2A  
**Started from main:** `ba342b0c5cb5c302078dd50d08185c0d8a50e196`  
**Scope:** foundation + shared primitives + shell pilot adoption only

## 1. Baseline findings

The Stage 1 shell already provides a sound structural viewport contract:

- the assistant owns one timeline scroll region;
- the Composer is a normal non-scrolling workspace slot;
- the primary navigation is a separate shell slot;
- `viewport-fit=cover` and `interactive-widget=resizes-content` are present;
- Android uses `adjustResize`.

The visual system, however, is still largely expressed through local Tailwind utility colors and one-off Slate values. Safe-area usage also exists in multiple places but is not yet governed by one shell-level token contract. The primary bottom navigation previously used only `max(.45rem, env(safe-area-inset-bottom))`, which is visually too low when the browser/WebView reports a zero or very small inset.

## 2. Font decision

Stage 2A keeps the current self-hosted **Noto Sans Arabic variable font**.

Reason:

- it is already local and stable;
- Arabic/Latin coverage is explicit;
- variable weights allow a thinner professional heading hierarchy;
- changing to a pure system stack now would add rendering variance without solving the main problem.

The strategy is therefore **Noto first + system fallback**, with Stage 2A correcting scale, line-height and weights before considering a future font migration.

## 3. Internal Release Train plan

### 2A.1 — Semantic Color System

Introduces semantic roles for:

- brand spectrum;
- canvas/surfaces;
- borders;
- text hierarchy;
- interactive/focus/selection;
- success/warning/danger/info.

Brand Green and Success Green are separate tokens and separate values.

Dark-mode values are defined as readiness only. Dark mode is not shipped in Stage 2A.

### 2A.2 — Typography / spacing / radius / elevation

Defines:

- Arabic-aware type sizes and line heights;
- regular / medium / heading / strong weights;
- 4px-based spacing rhythm;
- restrained radius scale;
- three elevation levels.

The intent is to reduce visual hierarchy dependence on nested cards and heavy shadows.

### 2A.3 — Core visual primitives and section signatures

Shared primitives:

- `SanadSurface`;
- `SanadSectionHeader`;
- `SanadStatusChip`;
- `SanadIconContainer`.

Shared CSS primitives cover:

- canvas;
- surfaces;
- section titles/descriptions;
- pills/status;
- icon boxes;
- focus rings;
- shell header/nav/composer/sidebar.

Section signatures remain within one SANAD identity:

- Assistant: lime → mint → aqua;
- Financial: cool aqua/teal;
- Commercial: ink/steel with restrained indigo;
- Account: neutral/ink.

### 2A.4 — Mobile safe-area baseline

The shared contract is:

```
Timeline
↓
Composer
↓
App Bottom Navigation
↓
safe-area / system-clearance floor
↓
device navigation area
```

Tokens:

- `--sanad-safe-top`;
- `--sanad-safe-bottom`;
- `--sanad-mobile-bottom-clearance`;
- `--sanad-mobile-nav-min-height`;
- `--sanad-mobile-nav-stack-height`.

The shell uses the platform inset when it is meaningful, while retaining a 0.75rem design floor when a browser/WebView reports 0px. This is a shell-level rule, not a device-specific patch.

## 4. Pilot adoption in the first Stage 2A batch

Adopted now:

1. Product shell canvas and section signature hook.
2. Product app header.
3. Primary left rail / mobile bottom nav.
4. SANAD AI workspace canvas.
5. Composer surface.
6. Assistant sidebar.
7. Shared settings switches/rows.
8. One representative structured response surface (customer statement).

Not redesigned now:

- Financial screens;
- Commercial screens;
- Account screens;
- Work Center;
- Entity System;
- Context Inspector;
- semantic response architecture;
- command palette;
- full dark mode;
- logo.

Financial/Commercial/Account only inherit the shell canvas/signature foundation in this batch.

## 5. Icon and motion rules

Lucide remains the default icon system.

- standard shell icon size stays approximately 18px;
- active state contrast is owned by semantic nav state, not hard-coded icon color;
- no new icon package is introduced.

Motion remains restrained. Existing reduced-motion behavior is preserved and foundation transitions are disabled/reduced under `prefers-reduced-motion`.

## 6. QA contract

The Stage 2A contract check verifies:

- semantic tokens exist;
- Brand Green != Success Green;
- typography/spacing/radius/elevation scales exist;
- all four section signatures exist;
- safe-area vars and viewport metadata exist;
- bottom nav uses the shared clearance token;
- shell/composer/header/sidebar pilot surfaces use the foundation;
- dark readiness exists without enabling dark mode;
- shared primitives exist.

Desktop remains the primary visual review target. Mobile review specifically checks bottom-system clearance, composer/nav stacking, tap targets, active state contrast and readable density.
