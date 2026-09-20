import { useEffect, useState } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SANAD_APP_VERSION } from '../../lib/appVersion';
import { getUserAvatarUrl } from '../../lib/userAvatar';
import NotificationBell from '../notifications/NotificationBell';

type Props = {
  userId: string | null;
};

type HeaderProfile = {
  full_name?: string | null;
  avatar_path?: string | null;
};

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default function ProductAppHeader({ userId }: Props) {
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const base = basePath();

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,avatar_path')
          .eq('id', userId)
          .maybeSingle();
        if (active) setProfile((data || null) as HeaderProfile | null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [userId]);

  return (
    <header
      id="product_app_header"
      className="sticky top-0 z-[60] border-b border-slate-200/75 bg-white/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:px-4"
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3">
        <a href={`${base}sanad-ai`} className="flex min-w-0 items-center gap-2" aria-label="العودة إلى سند">
          <div className="flex flex-col items-start">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="سند"
              className="h-9 w-auto object-contain sm:h-10"
            />
            <span className="-mt-1 self-center font-mono text-[7px] font-bold tracking-wider text-slate-400" dir="ltr">
              V{SANAD_APP_VERSION}
            </span>
          </div>
        </a>

        {userId ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <a
              href="/payment-inbox.html"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
              aria-label="فتح وارد المدفوعات"
              title="وارد المدفوعات"
            >
              <Inbox className="h-4.5 w-4.5" />
            </a>
            <NotificationBell onNavigate={() => window.location.assign(`${base}notifications`)} />

            <a
              href={`${base}profile`}
              className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 p-1 pl-2.5 pr-1 transition hover:border-slate-300 hover:bg-white"
              aria-label="فتح الحساب"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-white ring-2 ring-white shadow-sm">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : profile?.avatar_path ? (
                  <img
                    src={getUserAvatarUrl(profile.avatar_path)}
                    alt={profile.full_name || 'صورة المستخدم'}
                    className="h-full w-full object-cover"
                    decoding="async"
                  />
                ) : (
                  <span className="text-xs font-black">{profile?.full_name?.slice(0, 1) || 'س'}</span>
                )}
              </span>
              <span className="hidden max-w-28 truncate text-[10px] font-black text-slate-700 md:block">
                {profile?.full_name || 'حسابي'}
              </span>
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}
