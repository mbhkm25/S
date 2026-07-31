import { useEffect, useMemo, useState } from 'react';
import { Bell, BriefcaseBusiness } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toLatinDigits } from '../../lib/digits';
import { useNotifications } from '../../features/notifications/useNotifications';
import type { BusinessWorkspaceContext } from '../business/BusinessWorkspacesAccess';

interface NotificationBellProps {
  onNavigate: () => void;
}

function workspaceUrl(contexts: BusinessWorkspaceContext[]): string {
  const accessible = contexts.filter(item => item.permissions?.view === true);
  if (contexts.length === 1 && accessible.length === 1) {
    const params = new URLSearchParams({
      business_id: contexts[0].business_id,
      return_to: '/profile#business-workspaces'
    });
    return `/payment-inbox.html?${params.toString()}`;
  }
  return '/profile#business-workspaces';
}

export default function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { unreadCount } = useNotifications();
  const [workspaces, setWorkspaces] = useState<BusinessWorkspaceContext[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_my_business_workspaces');
      if (!active || error) return;
      setWorkspaces(Array.isArray(data?.items) ? data.items : []);
    };
    void load();
    return () => { active = false; };
  }, []);

  const newPayments = useMemo(
    () => workspaces.reduce((total, item) => total + Number(item.permissions?.view ? item.counts?.new || 0 : 0), 0),
    [workspaces]
  );

  return (
    <div className="flex items-center gap-1">
      {workspaces.length > 0 && (
        <a
          href={workspaceUrl(workspaces)}
          className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-slate-600 transition-all hover:bg-emerald-50 hover:text-emerald-800"
          aria-label={workspaces.length === 1 ? `فتح مساحة عمل ${workspaces[0].business_name}` : 'فتح مساحات العمل'}
          title="مساحات العمل"
        >
          <BriefcaseBusiness className="h-5.5 w-5.5" />
          {newPayments > 0 && (
            <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] select-none items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black leading-none text-white animate-scale-in">
              {newPayments > 99 ? '99+' : toLatinDigits(String(newPayments))}
            </span>
          )}
        </a>
      )}

      <button
        onClick={onNavigate}
        className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl p-2 text-slate-600 transition-all hover:bg-slate-100/70 hover:text-slate-900"
        aria-label="فتح الإشعارات"
        title="الإشعارات"
      >
        <Bell className="h-5.5 w-5.5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] select-none items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white animate-scale-in">
            {unreadCount > 99 ? '99+' : toLatinDigits(String(unreadCount))}
          </span>
        )}
      </button>
    </div>
  );
}