import { Image as ImageIcon } from 'lucide-react';
import BusinessManageV3 from './BusinessManageV3';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessManage(props: Props) {
  return (
    <div className="relative">
      <BusinessManageV3 {...props} />
      <button
        type="button"
        onClick={() => props.onNavigate('business-manage-profile')}
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3 z-40 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 text-[10px] font-bold text-slate-900 shadow-[0_12px_35px_rgba(15,23,42,0.18)] ring-1 ring-slate-200 sm:left-5"
        aria-label="تعديل صورة البروفايل وصورة الغلاف"
      >
        <ImageIcon className="h-4 w-4" />
        الهوية البصرية
      </button>
    </div>
  );
}
