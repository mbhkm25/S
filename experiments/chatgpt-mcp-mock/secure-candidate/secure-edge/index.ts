// SANAD secure candidate: restricted deny-all deployment, no financial database access.
// Deployed separately as sanad-mcp-secure-v1 with verify_jwt: true.
// JWT validation alone does not grant financial access; every tool call still
// fails closed pending independently approved consent, entitlement, role grants.
import {createSecureHandler, type VerifiedIdentity} from "./handler.ts";

async function verifiedUser(bearer: string): Promise<VerifiedIdentity | null> {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!projectUrl || !publicKey) return null;
  const endpoint = new URL("/auth/v1/user", projectUrl);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: publicKey, authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("id" in user)) return null;
    const id = (user as { id?: unknown }).id;
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) return null;
    return { id };
  } catch {
    return null;
  }
}

const edgeRuntime = Deno as typeof Deno & {serve: (handler: (request: Request) => Promise<Response>) => void};
edgeRuntime.serve(createSecureHandler(verifiedUser));
