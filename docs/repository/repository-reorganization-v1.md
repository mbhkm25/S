# SANAD Repository Reorganization v1

Status: Proposal only. Do not perform a broad move/rename until the current financial/commercial workstream is functionally complete and CI is green.

## Goal

Make the repository readable by product domain instead of forcing maintainers to infer architecture from historical folders and feature accumulation.

## Proposed top-level shape

```text
apps/
  sanad-web/            # React/Vite PWA
  sanad-admin/          # admin surface
  sanad-android/        # Capacitor/Android host

packages/
  ui/                   # shared design primitives
  auth/                 # session/auth helpers
  domain-financial/     # personal finance client contracts/types
  domain-commercial/    # commercial client contracts/types
  domain-account/       # account-center client contracts/types
  domain-ai/            # AI context contracts/types
  platform-notifications/
  platform-reporting/

integrations/
  erp/
    edaa/
  bridge/
    windows/

supabase/
  migrations/
  functions/
  tests/

docs/
  architecture/
  domains/
    financial/
    commercial/
    account/
    ai/
  integrations/
  engineering/
  roadmaps/
  repository/

scripts/
  ci/
  database/
  release/
```

## Frontend domain shape inside `apps/sanad-web/src`

```text
app/                    # shell, route composition, providers
shared/                 # generic UI/runtime utilities only
domains/
  financial/
    api/
    components/
    pages/
    types/
    tests/
  commercial/
    api/
    components/
    pages/
    types/
    tests/
  account/
  ai/
platform/
  auth/
  notifications/
  storage/
  reports/
```

## Migration principles

1. **No flag day.** Move one bounded domain at a time.
2. **No behavior changes during path moves.** Structural PRs should be mechanically reviewable.
3. **Preserve Git history** with file moves where possible.
4. **Add compatibility imports** temporarily if a large route/component has many consumers.
5. **CI before and after every move.** Route checks, TypeScript, build, Android checks and migration audits must stay green.
6. **Supabase migration history is never rewritten.** Only source organization around migrations/tests changes; applied migration names/ordering remain immutable.
7. **Bridge stays isolated.** Windows Bridge and ERP adapters must not be mixed into web product-domain code.

## Recommended migration order

Phase 1 — documentation and new-code discipline
- adopt `docs/architecture`, `docs/engineering`, `docs/repository`;
- place all new four-domain frontend code under a domain-oriented namespace;
- stop creating unrelated modules in generic `components/` when a domain owner is clear.

Phase 2 — frontend domain extraction
- move new Financial workspace first;
- Commercial second;
- Account Center third;
- AI fourth;
- keep existing verification/operations flows stable.

Phase 3 — platform extraction
- auth/session helpers;
- notifications/push;
- report primitives;
- storage/runtime compatibility.

Phase 4 — app shells
- separate web/admin build roots if the current combined root continues to create coupling;
- preserve deployment and Capacitor paths with explicit aliases/build configuration.

Phase 5 — integration cleanup
- move `bridge/windows` under `integrations/bridge/windows` only after installer/service work stabilizes;
- group Edaa docs, contracts and test fixtures under `integrations/erp/edaa` while preserving migration/function references.

## What must not be moved yet

Until the current workstream passes functional and UI validation:
- current Bridge code and its shop-machine checkpoint;
- applied Supabase migrations;
- deployment workflow names/paths;
- stable verification/operation-entry routes.

## Definition of done for reorganization

The reorganization is complete only when:
- a new engineer can locate each product domain in under one minute;
- every domain has an owner README describing data, RPCs and UI entrypoints;
- cross-domain imports are intentional and minimal;
- generic shared folders contain only truly cross-domain code;
- GitHub Actions remain green;
- production deployment paths are unchanged or deliberately migrated with rollback instructions.
