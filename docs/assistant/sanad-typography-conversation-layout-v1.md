# SANAD Typography & Conversation Layout v1

Status: **Merged to `main` through PR #340** as part of the combined Phases 2–4 refinement release. Awaiting Production deployment.

## Scope

Phase 2 addresses the post-release UI issues around:
- Arabic typography hierarchy;
- excessive visual weight;
- legacy micro-copy that is too small;
- nested card density inside SANAD Agent;
- conversation scrolling;
- composer stability.

It does not change navigation architecture or the Agent orb. Those remain Phase 3 and Phase 4.

## Primary typeface

SANAD uses **Noto Sans Arabic** as the primary application typeface.

The production frontend must not depend on Google Fonts for this primary font.

Tracked local assets:
- `public/fonts/noto-sans-arabic-arabic-wght-normal.woff2`
- `public/fonts/noto-sans-arabic-latin-wght-normal.woff2`
- `public/fonts/NotoSansArabic-OFL.txt`

Both webfont files are variable WOFF2 assets. CSS uses `font-display: swap`.

Fallback stack:

`"Noto Sans Arabic", system-ui, -apple-system, "Segoe UI", Arial, sans-serif`

The font is distributed under the SIL Open Font License; the tracked license file remains with the packaged assets.

## Weight policy

Normal body text defaults to weight 400.

Preferred hierarchy:
- body and secondary copy: 400;
- controls and emphasized labels: 500;
- section/card/page headings: 600;
- 700 is reserved for exceptional emphasis.

Legacy `font-black` and `font-extrabold` utilities are capped at 600 globally so historical screens do not render 800/900 headings.

## Type scale

Target scale:
- metadata/caption: 11–12 px;
- secondary copy: 12–13 px;
- body/UI: 14–15 px;
- buttons: 13–14 px;
- section/card title: 15–17 px;
- page title: 20–24 px;
- important financial numbers: 20–28 px.

For legacy code that still uses arbitrary micro sizes:
- `text-[7px]` and `text-[8px]` have an 11 px rendering floor;
- `text-[9px]` and `text-[10px]` have a 12 px rendering floor.

This avoids a broad markup rewrite while removing unreadable micro-copy across existing SANAD surfaces.

## Conversation surface

The Agent workspace is one bounded primary surface.

Only the message timeline scrolls:
- workspace uses a bounded viewport-relative height;
- the internal grid and conversation column use `min-h-0`;
- the message timeline owns `overflow-y-auto`;
- scrolling is contained and smooth.

Ordinary assistant messages are not wrapped in a bordered/shadow card. Cards remain appropriate for independent business objects such as:
- customer statements;
- document lists;
- action review/drafts;
- warnings/attention items;
- independent result surfaces.

Structured response components reduce nested card-on-card presentation by preferring separators and light background tints for subordinate data.

## Composer

The Agent composer is a stable workspace footer:
- `sticky bottom-0`;
- separate from the scrolling message timeline;
- safe-area aware at the bottom;
- translucent/blurred background only to maintain separation from content;
- voice, attachments and send controls remain inside the same composer contract.

This prevents the input area from moving away with message scrolling.

## Regression protection

`scripts/check-sanad-agent-workspace.ts` verifies:
- no Google Fonts runtime dependency for the primary typeface;
- local Arabic and Latin WOFF2 references;
- `font-display: swap`;
- variable font range;
- Agent workspace identity;
- sticky composer;
- scroll ownership on the message timeline;
- no `font-black` inside Phase 2 Agent UI sources.

`scripts/check-financial-workspace-routes.ts` protects the same local-font contract so older tests cannot silently restore the previous Google Fonts implementation.

## Release state

Phase 2 was integrated together with Phases 3 and 4 through PR #340.

Feature merge commit:

`ac9e11ba20e4d8a5ecf0dc9553225cfa211a76d9`

Production deployment is intentionally separate from the merge. The deployment workflow must validate the current `main` release SHA, Agent backend contract, production build and bundle budget before SSH deployment.
