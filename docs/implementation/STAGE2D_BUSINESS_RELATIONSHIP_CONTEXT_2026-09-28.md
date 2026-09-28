# Business-first relationship context — 2026-09-28

## Decision and scope

The user accepted #420 and explicitly reprioritized SANAD around the business, owner/manager, team and customers. Personal management remains an additional user feature. Preserve the accepted personal draft packages; prioritize business relationship correctness before expanding commercial editing. This addendum changes delivery priority, not the existing architecture or canonical financial commands.

This package builds on #420 (485c8f15d2e6dc3f8da81c29e673d93f0f1f7e17). It does not merge, publish Web, change Bridge, write ERP data, create financial transactions, or introduce migrations/parallel identity stores.

## Existing contracts and boundary

- `get_my_sanad_agent_thread_v2`: authenticated participant, saved project/business, conversation role.
- `get_user_business_contexts`: existing ownership, active team membership and active customer relationship. Minimize its broad result to the current business; never send pending invitation tokens, other businesses, job titles or permission dictionaries to the model.
- Business ownership is `business_profiles.owner_user_id`. Conversation ownership is separate. A manager job title is not a grant. Team operations retain the current domain RPC checks.
- The saved conversation business wins. A conflicting request business is rejected before model execution. Each tool re-reads participation and relationship, rejects a different business argument and preserves downstream domain authorization.
- Filter tools in both initial/follow-up SSE and JSON model calls. Recheck at execution even if an unavailable tool is proposed by the model.
- Personal financial tools and actor-private memory reads/writes are unavailable in business conversations. This does not purge old messages/summaries or claim comprehensive privacy for previously shared personal conversations.
- `business_get_my_relationship` and legacy `business_list_accessible` return only the current relationship. Customers can inspect their relationship but cannot use staff-wide ERP/customer lookup tools.
- Commercial preparation remains business owner AND conversation owner. Team reads retain existing owner/active-member domain eligibility; this package does not implement granular manager delegation.
- Launcher uses the same pure policy with authenticated RPC reads when opened, fails closed during loading/failure, and discards results after project changes. Presentation does not grant authority; server checks each operation.

## Deliberate limits and next business package

A SANAD customer user, business party and ERP AccountID are different identities. Customer self-service statements require an audited explicit binding; do not guess it from name/phone. Next: verify the existing delegation and customer-binding contracts, then implement authorized commercial draft editing and relationship-specific flows using canonical actions. Personal additions are secondary except fixes that preserve accepted behavior.

Two authenticated reads are added to business context and each business tool (one thread read plus relationship context). This favors fresh authorization; measure latency in actual local acceptance before optimizing. No new caching of relationship grants.

## Verification

- 84 isolated business boundary checks: owner/team/customer, multiple relationships, inactive memberships, thread-owner distinction, cross-business mismatch, malformed/inactive thread, viewer, unscoped thread, personal isolation, RPC failures and both transports.
- TypeScript lint and production build passed. Workspace bundle 116.39 KiB / 120 KiB.
- Existing expense chat: 78 cases; setup database: 122 cases; setup tools/presentation: 46 cases, all passed. Only isolated fixtures; zero real financial execution.
- The legacy Edge audit initially reported two existing strict-type errors as non-blocking warnings. Narrow the optional date to string and annotate the canonical revision payload as Json; runtime behavior is unchanged. Add an obligatory Deno check for the conversation agent before deployment.
- Existing source-contract assertions updated for filtered tools; terminal tool budget remains unchanged.
- No browser, screenshots, rendered interface tests or internal preview. User acceptance is outstanding.

## User acceptance on port 3000

Use a separate pinned worktree from C:\sanad-v3 with the same local environment configuration. Sign in normally; no credentials in reports.

1. Open a business conversation: plus menu → «علاقتي بالنشاط». Ask what relationship is recorded. Compare with real membership.
2. Owner: review existing business/ERP reads and source freshness without approving financial actions.
3. Ask to read another business within this conversation: must request switching projects, not disclose its data.
4. Ask for personal account balances within the business conversation: must direct to personal project, with no personal lookup/memory disclosure.
5. If actual team/customer test accounts exist, verify their distinct menus and role answers. Customer must not receive general customer search, business financial dashboard or commercial preparation.
6. Switch projects while the menu is loading; no previous project's actions should carry over. Close/reopen retries failed loading.
7. Verify the previously accepted personal draft flow in a personal conversation without approving a financial execution.

Web merge/deployment remains with the user after results. Backend activation and exact commit/CI evidence will be recorded separately before handoff.
