import { supabase } from '../../lib/supabase';
import { getUserBusinessContexts, type BusinessContexts, type BusinessProfile } from '../../lib/businessApi';
import {
  createSanadAgentThread, createSanadProjectThread, listSanadAgentThreads,
  listSanadProjectThreads, type SanadAgentThreadSummary, type SanadProjectThreadPage,
} from '../assistant/assistantWorkspaceApi';

/**
 * Short-lived, user-isolated read-through cache for project navigation.
 * This accelerates Today ↔ project transitions without caching financial
 * balances, expanding access or persisting sensitive project lists to storage.
 */
type Scope = 'personal' | 'business';
export type ProjectBusiness = Pick<BusinessProfile, 'id' | 'name' | 'workspace_role'>;
export type ProjectQuickData = {
  businesses: ProjectBusiness[];
  personal: SanadAgentThreadSummary[];
  businessThreads: Record<string, SanadAgentThreadSummary[]>;
  awaitingProjectContract: boolean;
};

const TTL_MS = 120_000; // Safe navigation reads, scoped per signed-in user; explicit mutations invalidate.
let currentUser: string | null = null;
let contextsCache: { expires: number; promise: Promise<BusinessContexts> } | null = null;
let legacyCache: { expires: number; promise: Promise<SanadAgentThreadSummary[]> } | null = null;
let projectRpcMissing = false;
let projectRpcRecheckAt = 0;
const projectPageCache = new Map<string, { expires: number; promise: Promise<SanadProjectThreadPage> }>();

async function sessionScope(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('انتهت جلسة الدخول؛ سجّل الدخول مجددًا.');
  if (id !== currentUser) {
    currentUser = id;
    invalidateProjectQuickAccess();
    projectRpcMissing = false;
    projectRpcRecheckAt = 0;
  }
  return id;
}

export function invalidateProjectQuickAccess(): void {
  contextsCache = null;
  legacyCache = null;
  projectPageCache.clear();
}

export async function getProjectBusinessContexts(): Promise<BusinessContexts> {
  await sessionScope();
  // Rejected promises are never re-used, and user scope is reset on change.
  if (contextsCache?.expires && contextsCache.expires > Date.now()) return contextsCache.promise;
  const pending = getUserBusinessContexts();
  contextsCache = { expires: Date.now() + TTL_MS, promise: pending };
  try { return await pending; } catch (err) { contextsCache = null; throw err; }
}

export function authorizedProjectBusinesses(contexts: BusinessContexts): ProjectBusiness[] {
  const businesses = new Map<string, ProjectBusiness>();
  for (const entry of [...contexts.owned_businesses, ...contexts.team_businesses]) {
    if (!entry?.id) continue;
    const previous = businesses.get(entry.id);
    const isOwner = entry.workspace_role === 'owner' || previous?.workspace_role === 'owner';
    businesses.set(entry.id, { id: entry.id, name: entry.name || previous?.name || 'نشاط تجاري', workspace_role: isOwner ? 'owner' : entry.workspace_role || previous?.workspace_role || null });
  }
  return Array.from(businesses.values());
}

export async function getLegacyPreviewThreads(): Promise<SanadAgentThreadSummary[]> {
  await sessionScope();
  if (legacyCache && legacyCache.expires > Date.now()) return legacyCache.promise;
  const pending = listSanadAgentThreads(100);
  legacyCache = { expires: Date.now() + TTL_MS, promise: pending };
  try { return await pending; } catch (err) { legacyCache = null; throw err; }
}

function isMissingContract(error: unknown): boolean {
  const value = String(error instanceof Error ? error.message : error);
  return /PGRST202|could not find the function|schema cache/i.test(value);
}

export async function projectThreads(params: {
  projectKind: Scope | 'legacy_unclassified';
  businessId?: string | null;
  status?: 'active' | 'archived';
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ page: SanadProjectThreadPage; contractPending: boolean }> {
  const user = await sessionScope();
  const status = params.status || 'active';
  const limit = params.limit ?? 50, offset = params.offset ?? 0;
  const key = JSON.stringify([user, params.projectKind, params.businessId || '', status, params.search || '', limit, offset]);
  if (projectRpcMissing && Date.now() >= projectRpcRecheckAt) projectRpcMissing = false;
  if (!projectRpcMissing) {
    let entry = projectPageCache.get(key);
    if (!entry || entry.expires <= Date.now()) {
      const promise = listSanadProjectThreads(params).catch((error: unknown) => {
        projectPageCache.delete(key);
        if (isMissingContract(error)) {
          projectRpcMissing = true;
          projectRpcRecheckAt = Date.now() + 30_000;
        }
        throw error;
      });
      entry = { expires: Date.now() + TTL_MS, promise };
      projectPageCache.set(key, entry);
    }
    try { return { page: await entry.promise, contractPending: false }; }
    catch (error) { if (!isMissingContract(error)) throw error; }
  }
  const all = await getLegacyPreviewThreads();
  // No legacy null-business conversation is silently called personal.
  const visible = params.projectKind === 'legacy_unclassified'
    ? all.filter((t) => t.business_id === null)
    : params.projectKind === 'business'
      ? all.filter((t) => t.business_id === params.businessId)
      : [];
  const term = (params.search || '').trim().toLocaleLowerCase('ar');
  const filtered = visible.filter((thread) =>
    thread.status === status && (!term || thread.title.toLocaleLowerCase('ar').includes(term))
  );
  return {
    page: {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
      project_kind: params.projectKind,
      business_id: params.projectKind === 'business' ? params.businessId || null : null,
    },
    contractPending: true,
  };
}

export async function loadProjectQuickData(): Promise<ProjectQuickData> {
  const [contexts, previewThreads] = await Promise.all([
    getProjectBusinessContexts(),
    // Fetch one authorized list for preview data, shared by all cards.
    getLegacyPreviewThreads().catch(() => [] as SanadAgentThreadSummary[]),
  ]);
  const businesses = authorizedProjectBusinesses(contexts);
  // Existing v2 histories can accelerate the home display. Null-business
  // records remain unclassified until explicit owner classification.
  const businessThreads: Record<string, SanadAgentThreadSummary[]> = {};
  for (const business of businesses) {
    businessThreads[business.id] = previewThreads.filter(t =>
      t.business_id === business.id && t.status === 'active'
    ).slice(0, 3);
  }
  // The personal v2 project RPC is the only reliable source of personal
  // threads (null-business legacy chats are NOT personal).
  let personal: SanadAgentThreadSummary[] = [];
  let awaitingProjectContract = projectRpcMissing;
  if (!projectRpcMissing) {
    try {
      const result = await projectThreads({ projectKind: 'personal', status: 'active', limit: 3 });
      personal = result.page.items;
      awaitingProjectContract = result.contractPending;
    } catch {
      // Keep project-card access available without pretending a read failure
      // means the user's personal history is empty.
      awaitingProjectContract = true;
    }
  }
  return { businesses, personal, businessThreads, awaitingProjectContract };
}

export async function openNewProjectConversation(projectKind: Scope, businessId?: string | null): Promise<string> {
  await sessionScope();
  if (projectKind === 'business' && !businessId) throw new Error('حدد النشاط التجاري أولًا.');
  try {
    const id = await createSanadProjectThread({ projectKind, businessId: businessId || null });
    // Once the approved migration is available, re-enable scoped reads in the
    // same session rather than requiring the user to sign out or reload.
    projectRpcMissing = false;
    projectRpcRecheckAt = 0;
    invalidateProjectQuickAccess();
    return id;
  } catch (error) {
    if (!isMissingContract(error)) throw error;
    if (projectKind === 'personal') throw new Error('المحادثات الشخصية الجديدة بانتظار اعتماد ونشر عقد المساحات. لم تُنشأ محادثة عامة بديلة.');
    const id = await createSanadAgentThread(businessId || null);
    invalidateProjectQuickAccess();
    return id;
  }
}
