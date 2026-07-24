-- SANAD assistant V6: make financial-operation follow-ups first-class.
-- Production migration already applied through Supabase.

-- Key behavior implemented:
-- 1) Extend claimed assistant context with the linked user's recent operations.
-- 2) Include both internal operation_id and public_token for safe matching.
-- 3) Add operation-aware response guidance so a UUID/public token is reviewed,
--    not misclassified into a generic SANAD overview or install prompt.
-- 4) Keep operation disclosure scoped to the linked user and relevant request.
-- 5) Set prompt version to sanad-service-ar-v6.

-- Canonical SQL is maintained in the applied production migration
-- assistant_operation_context_and_continuity_v6 plus
-- assistant_operation_public_token_match_v6_1.
