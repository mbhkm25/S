# SANAD Fluid Orb & Final Polish v1

Status: Phase 4 implementation on the shared SANAD refinement branch.

Branch:

`feat/sanad-refinement-phases-2-4-20260920`

Draft PR: #340

This phase completes the four-stage post-release refinement plan. It does not authorize merge or production deployment by itself.

## Objective

Replace the previous pulse-line Agent mark with a distinctive SANAD identity that communicates live Agent state without exposing hidden reasoning.

The visual direction is:

- translucent navy / indigo sphere;
- cyan / blue internal fluid wave;
- restrained glass highlight;
- subtle state glow;
- original SANAD presentation rather than a generic assistant icon;
- motion that supports status comprehension instead of decorative noise.

## Agent visual states

The canonical state contract is:

- `idle` — Agent is ready;
- `listening` — microphone capture is active;
- `thinking` — request interpretation / model processing / transcription is active;
- `executing` — a bounded SANAD tool is currently being used;
- `success` — the visible answer has completed successfully.

These are UI execution states only. They do not expose chain-of-thought.

## Runtime implementation

Canonical component:

`src/features/assistant/SanadFluidOrb.tsx`

The primary rendering path uses Canvas 2D.

It draws:

- deep SANAD navy/indigo base;
- moving cyan/blue waves clipped inside the sphere;
- state-aware wave amplitude and velocity;
- subtle moving internal aura;
- glass reflection;
- state-aware outer ring.

Canvas device pixel ratio is capped to avoid unnecessary GPU/memory cost on high-density mobile displays.

## CSS fallback

Canvas is enhancement, not a requirement.

A complete CSS orb remains behind the Canvas surface using:

- navy/indigo gradients;
- cyan/blue layered waves;
- glass highlight;
- state-specific shell animation and glow.

If Canvas 2D cannot be created, the CSS visual remains fully usable.

Small static Orb instances deliberately stay on CSS only:
- message identity marks;
- mobile sidebar identity.

This avoids creating a Canvas context for every historical assistant message.

## Motion accessibility

Both Canvas and CSS honor:

`prefers-reduced-motion: reduce`

When reduced motion is requested:
- the Canvas draws a static state frame;
- requestAnimationFrame is not continued;
- CSS animations and transitions on the Orb are disabled.

The semantic state remains visible through color/form and surrounding status text.

## Voice bridge

`SanadVoiceDictationButton` now exposes:

`idle | listening | transcribing`

The workspace maps:
- `listening -> listening`;
- `transcribing -> thinking`;
- voice completion/cancel -> `idle`.

Voice behavior remains review-before-send. The Orb does not send or approve anything.

## Agent stream bridge

The workspace maps real SSE events rather than simulated timers:

- `run.started -> thinking`;
- `agent.status -> thinking`;
- `tool.started -> executing`;
- `tool.completed -> executing`;
- `answer.final -> thinking` while the final verified result closes;
- completed visible answer -> `success`;
- failure -> `idle`.

Success is displayed briefly, then returns to idle.

## Presentation locations

The Orb is used in:

- Agent workspace header;
- empty-state hero;
- live execution status;
- assistant message identity;
- mobile Assistant sidebar.

Large active instances use Canvas.
Small passive instances use the CSS fallback.

## Final UI polish

Phase 4 also makes the Agent surface quieter:

- removes dark square containers around the Agent identity;
- uses the Orb itself as the identity surface;
- tones down the live-execution card border/shadow;
- keeps the Phase 2 single-surface conversation model;
- retains the sticky composer;
- adds a subtle focus ring to the composer;
- exposes live execution text through `role="status"` and `aria-live="polite"`.

## Performance boundary

Phase 3 bundle budgets remain mandatory.

The SANAD Agent workspace has a raw production budget of 120 KB. The Fluid Orb must fit inside that existing budget; Phase 4 does not relax it.

Static historical message marks avoid Canvas contexts to keep long conversations efficient.

## Regression protection

`scripts/check-sanad-agent-visual-v4.ts` protects:

- all five Orb states;
- Canvas 2D rendering path;
- CSS fallback;
- small-static CSS optimization;
- requestAnimationFrame cleanup;
- reduced-motion handling;
- Agent stream state mapping;
- voice state mapping;
- removal of the legacy `working` pulse state;
- mobile sidebar Orb;
- live-status accessibility.

The existing SANAD Agent workspace contract is also updated from Visual v3 to Visual v4.

## Compatibility

`SanadPulseMark.tsx` remains only as a compatibility re-export to `SanadFluidOrb`.

New Agent UI code must use `SanadFluidOrb` directly.

## Non-goals

Phase 4 does not:
- change the Agent model;
- change financial truth or tool authorization;
- change Supabase schema;
- alter Draft -> Review -> Explicit Approval action governance;
- write to Edaa;
- merge the shared branch;
- deploy to Production.

## Merge gate

After Phase 4:

1. all combined Phase 2–4 CI must pass on one final head;
2. PR #340 remains Draft until explicit merge authorization;
3. combined end-to-end browser/mobile validation occurs after the requested merge/deployment step;
4. final production testing must verify navigation, typography, voice, attachments, Orb states and action governance together.
