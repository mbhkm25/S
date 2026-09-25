/**
 * Stage 2C: project context is navigation state, NEVER an authorization token.
 * The backend must independently validate the actor and entity for each request.
 */
export type SanadProject = { kind: 'personal' } | { kind: 'business'; businessId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readSanadProject(search: string): SanadProject | null {
  const params = new URLSearchParams(search);
  const kind = params.get('project');
  if (kind === 'personal' && !params.has('business')) return { kind: 'personal' };
  const businessId = params.get('business');
  if (kind === 'business' && businessId && UUID.test(businessId)) {
    return { kind: 'business', businessId };
  }
  return null;
}

export function projectConversationHref(project: SanadProject, options?: { threadId?: string; create?: boolean }): string {
  const params = new URLSearchParams();
  params.set('project', project.kind);
  if (project.kind === 'business') params.set('business', project.businessId);
  if (options?.threadId) params.set('thread', options.threadId);
  if (options?.create) params.set('new', '1');
  return 'sanad-ai?' + params.toString();
}

export function sameSanadProject(project: SanadProject, thread: {
  business_id: string | null;
  project_kind?: string | null;
}): boolean {
  if (project.kind === 'business') return thread.business_id === project.businessId;
  return thread.business_id === null && thread.project_kind === 'personal';
}

export type SanadProjectConversation = {
  id: string;
  business_id: string | null;
  project_kind: 'personal' | 'business';
  title: string;
  status: 'active' | 'archived';
  summary?: string | null;
  last_message_at?: string | null;
  message_count: number;
  my_role?: 'owner' | 'member' | 'viewer';
  is_pinned: boolean;
  created_at: string;
};

export type SanadProjectThreadPage = {
  items: SanadProjectConversation[];
  pinned: SanadProjectConversation[];
  next_cursor: { at: string; id: string } | null;
};
