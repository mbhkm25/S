# Stage 2D.1 — server-owned capability descriptors (read-only contract)

**Stage 2D.1 final state:** PR #409 MERGED (`49feb2b668d5cc9cab9d90c4b9111a78c7b4a01d`), all seven exact-head CI checks PASS. Reviewed descriptor RPC was applied to production with ledger version `20260926214745`, and verified available to authenticated but not anonymous callers. This remains a read-only backend descriptor; no front-end switch to an editable general-purpose form is implied.

## Rationale and audited reuse

The live canonical system already persists all action drafts in `public.sanad_agent_actions`, with a server-generated review payload, owner-scoped create/get/list, expected-version approve/cancel, fingerprint reuse and domain command mapping. The existing 2C.5 launcher displays *presentation-only* actions using static existing tool definitions. A second action engine would duplicate validation and permit inconsistent approvals; 2D must keep the existing canonical RPCs as authority.

## Implemented response contract

The authenticated, owner-thread-resolved descriptor returns `schema_version=1`, canonical `thread_id`, server-assigned `project_kind`/`business_id`, existing RPC identifiers, `approval_requires_expected_version=true`, `form_edit_supported=false`, `erp_write_supported=false`, and only currently deployed variants:

- **Personal Manager:** existing `personal_transaction` variants income, expense and same-currency transfer. Fields document what canonical server validation actually requires; absence of a saved account means the *form may still need setup*, not permission for an invented account.
- **Business:** existing `commercial_document_draft` with quotation, sale/purchase invoice, receipt/payment and expense variants. Display only for current *business owner* of the exact owner-thread business. Approval produces a **SANAD domain Draft**, never Edaa.
- **Restricted/legacy/unclassified/misbound:** no actionable descriptors. A thread belonging to another actor fails with a generic not-found error; a browser-supplied project hint is ignored. Existing canonical create/approve RPCs independently reauthorize each operation.

The RPC is descriptor-only, does not read other parties or balances and never executes or modifies a draft. It deliberately reports `form_edit_supported=false` until 2D.2 has a full versioned patch/create/review test; do not present a fake two-way edit form.

## Next integration gate

2D.2 introduces an authorized, server-validated **edit by action_id + expected_version** contract, regenerates review from canonical fields, invalidates stale approval and preserves original actor/project/business and attached source IDs; then a form adapter can fetch this descriptor and reuse the single persisted draft. Test cross-project denial, concurrent stale versions, two retries creating one action, voice/prompt/form same ID and explicit approval isolation. Type-aware Arabic entity autocomplete is 2D.3 and must query only owner-authorized account/category or business party IDs.

**Release discipline:** Do not merge two independent migrations using guessed timestamps or blind `supabase db push` while historical migration deploy-gate remains fail-closed. Use reviewed live migration API, inspect applied version and reconcile repo filename with that actual version before merge, as established by the preceding 2D.0 gate.
