import { supabase } from '../../lib/supabase';
import { toUserSafeServiceError } from '../../lib/userFacingError';

export type BusinessWorkspace = {
  business_id: string;
  business_name: string;
  slug: string | null;
  is_owner: boolean;
  membership_status: string;
  membership_role: string | null;
  job_title: string | null;
  permissions: {
    view: boolean;
    claim: boolean;
    complete: boolean;
    release: boolean;
    reassign: boolean;
    review: boolean;
  };
  counts: {
    new: number;
    mine: number;
    team_active: number;
    review_required: number;
    completed_today: number;
    open_total: number;
  };
};

export type BusinessWorkspacesContract = {
  contract_version: number;
  workspace_count: number;
  items: BusinessWorkspace[];
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown): boolean { return value === true; }

export async function getBusinessWorkspaces(): Promise<BusinessWorkspacesContract> {
  const { data, error } = await supabase.rpc('get_my_business_workspaces');
  if (error) {
    console.error('[SANAD business workspaces]', { code: error.code, message: error.message, details: error.details });
    throw toUserSafeServiceError(error, 'تعذر تحميل مساحات الأعمال حاليًا.');
  }

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    contract_version: num(payload.contract_version) || 2,
    workspace_count: num(payload.workspace_count),
    items: items.map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const permissions = (row.permissions && typeof row.permissions === 'object' ? row.permissions : {}) as Record<string, unknown>;
      const counts = (row.counts && typeof row.counts === 'object' ? row.counts : {}) as Record<string, unknown>;
      return {
        business_id: String(row.business_id ?? ''),
        business_name: String(row.business_name ?? ''),
        slug: row.slug ? String(row.slug) : null,
        is_owner: bool(row.is_owner),
        membership_status: String(row.membership_status ?? ''),
        membership_role: row.membership_role ? String(row.membership_role) : null,
        job_title: row.job_title ? String(row.job_title) : null,
        permissions: {
          view: bool(permissions.view), claim: bool(permissions.claim), complete: bool(permissions.complete),
          release: bool(permissions.release), reassign: bool(permissions.reassign), review: bool(permissions.review),
        },
        counts: {
          new: num(counts.new), mine: num(counts.mine), team_active: num(counts.team_active),
          review_required: num(counts.review_required), completed_today: num(counts.completed_today), open_total: num(counts.open_total),
        },
      };
    }),
  };
}
