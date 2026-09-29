// Offline authorization-policy design fixture ONLY: no database, no Supabase token verification,
// no production financial reads. Test cases demonstrate intended deny-by-default behavior.
// Do not use as a production security boundary or treat caller-supplied actor attributes as verified.
export const READ_TOOLS = Object.freeze(["list_businesses","get_sync_status","search_customers","get_customer_statement"]);
export function evaluateMockReadPolicy({principal, businessId, tool, accountId, entitlement} = {}) {
 if (!principal?.verified || !principal?.userId) return {allow:false,reason:"authentication_required"};
 if (!principal?.consent) return {allow:false,reason:"explicit_consent_required"};
 if (!entitlement?.active) return {allow:false,reason:"subscription_or_trial_inactive"};
 if (!READ_TOOLS.includes(tool)) return {allow:false,reason:"unsupported_tool"};
 const relationships = Array.isArray(principal.relationships) ? principal.relationships : [];
 if(tool === "list_businesses") {
  const visible = relationships.filter(r => r.active && (r.role === "owner" || (r.role === "team" && r.financialReadGrant === true))).map(r=>r.businessId);
  return visible.length ? {allow:true,businessIds:visible} : {allow:false,reason:"no_eligible_business"};
 }
 if(!businessId || principal.currentBusinessId !== businessId) return {allow:false,reason:"business_scope_mismatch"};
 const relation=relationships.find(r=>r.businessId===businessId && r.active);
 if(!relation) return {allow:false,reason:"business_access_denied"};
 if(relation.role !== "owner" && !(relation.role==="team" && relation.financialReadGrant===true)) return {allow:false,reason:"financial_role_not_authorized"};
 if(tool==="get_customer_statement" && !/^[0-9]{1,15}$/.test(String(accountId??"")))return {allow:false,reason:"valid_account_id_required"};
 return {allow:true,businessId,tool};
}
