import { Image as ImageIcon } from 'lucide-react';
import BusinessManageV3 from './BusinessManageV3';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessManage(props: Props) {
  return (
    <div className="space-y-3">
      <section className="mx-0.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:mx-3">
        <button
          type="button"
          onClick={() => props.onNavigate('business-manage-profile')}
          className="flex w-full items-center gap-3 text-right"
          aria-label="فتح قسم الهوية البصرية"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ImageIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold text-emerald-700">قسم إدارة النشاط</span>
            <strong className="mt-0.5 block text-xs text-slate-950">الهوية البصرية</strong>
            <span className="mt-1 block text-[9px] leading-5 text-slate-500">صورة البروفايل، صورة الغلاف، ومعرض النشاط.</span>
          </span>
          <span className="text-lg text-slate-300">‹</span>
        </button>
      </section>
      <BusinessManageV3 {...props} />
    </div>
  );
}
