import type { User } from '@supabase/supabase-js';
import { Bell, ChevronLeft, CircleHelp, CreditCard, Fingerprint, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { Profile } from '../../types';

interface Props {
  user: User;
  profile: Profile | null;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

function initials(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'س';
  return parts.slice(0, 2).map((part) => part[0]).join('');
}

export default function AccountHome({ user, profile, onNavigate, onSignOut }: Props) {
  const verified = profile?.phone_verification_status === 'verified';
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-5" dir="rtl">
      <header className="mb-6"><p className="mb-1 text-[12px] font-bold text-emerald-700">هويتك في سند</p><h1 className="text-[30px] font-black tracking-tight text-slate-950">حسابي</h1><p className="mt-1 text-[13px] leading-6 text-slate-500">الهوية، الأمان، الإشعارات والاشتراك فقط. أموالك وأعمالك أصبحت في أقسامها المستقلة.</p></header>

      <section className="mb-5 flex items-center gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-[18px] font-black text-white">{initials(profile?.full_name)}</div>
        <div className="min-w-0 flex-1"><h2 className="truncate text-[17px] font-black text-slate-950">{profile?.full_name || 'مستخدم سند'}</h2><p className="mt-1 truncate text-[11px] text-slate-400">{profile?.phone || user.email || 'حساب سند'}</p><div className={`mt-2 inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><ShieldCheck className="h-3.5 w-3.5" />{verified ? 'الهوية الهاتفية موثقة' : 'الهوية تحتاج مراجعة'}</div></div>
      </section>

      <section className="mb-5 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
        <AccountRow icon={UserRound} title="الملف الشخصي" subtitle="الاسم والصورة وبيانات الهوية" onClick={() => onNavigate('/profile')} />
        <AccountRow icon={LockKeyhole} title="الأمان وتسجيل الدخول" subtitle="خيارات حماية الوصول إلى سند" onClick={() => onNavigate('/profile')} />
        <AccountRow icon={Fingerprint} title="مفاتيح المرور والأجهزة" subtitle="إدارة وسائل الدخول الموثوقة" onClick={() => onNavigate('/profile')} />
        <AccountRow icon={Bell} title="الإشعارات" subtitle="مركز التنبيهات وحالة الرسائل" onClick={() => onNavigate('/notifications')} />
        <AccountRow icon={CreditCard} title="الاشتراك" subtitle="الخطة والاستخدام وحدود الخدمة" onClick={() => onNavigate('/profile')} />
      </section>

      <section className="mb-5 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
        <AccountRow icon={CircleHelp} title="المساعدة والدعم" subtitle="المساعدة والتواصل مع سند" onClick={() => onNavigate('/profile')} />
      </section>

      <button type="button" onClick={onSignOut} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 py-3.5 text-[12px] font-black text-rose-700"><LogOut className="h-4 w-4" /> تسجيل الخروج</button>
    </main>
  );
}

function AccountRow({ icon: Icon, title, subtitle, onClick }: { icon: typeof UserRound; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 text-right last:border-b-0 active:bg-slate-50">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700"><Icon className="h-4.5 w-4.5" /></div><div className="min-w-0"><p className="text-[13px] font-black text-slate-950">{title}</p><p className="mt-1 truncate text-[10px] text-slate-400">{subtitle}</p></div></div><ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" />
    </button>
  );
}
