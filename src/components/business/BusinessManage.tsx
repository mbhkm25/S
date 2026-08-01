import { LayoutTemplate, WalletCards } from 'lucide-react';
import BusinessFinancialAccountsCenter from './BusinessFinancialAccountsCenter';
import BusinessManageV3 from './BusinessManageV3';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessManage(props: Props) {
  const openPaymentInbox = () => {
    window.location.assign('/payment-inbox.html');
  };

  return (
    <div className="space-y-3">
      <section className="mx-2 sm:mx-3" aria-labelledby="business-core-tools-title">
        <div className="mb-2 px-1">
          <span className="text-[9px] font-bold text-emerald-700">الوصول السريع</span>
          <h2 id="business-core-tools-title" className="mt-0.5 text-sm font-black text-slate-950">التشغيل والهوية المالية</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">ثلاثة مسارات رئيسية لتشغيل النشاط وإدارة ظهوره وحساباته.</p>
        </div>

        <div className="space-y-3">
          <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={openPaymentInbox}
              className="flex w-full items-center gap-3 text-right"
              aria-label="فتح وارد المدفوعات"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                <WalletCards className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold text-emerald-700">تشغيل المدفوعات</span>
                <strong className="mt-0.5 block text-xs text-slate-950">وارد المدفوعات</strong>
                <span className="mt-1 block text-[9px] leading-5 text-slate-500">استلام العمليات بين أعضاء الفريق، منع التكرار، وإكمال كل عملية باسم منفذها.</span>
              </span>
              <span className="text-lg text-emerald-400">‹</span>
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={() => props.onNavigate('business-manage-profile')}
              className="flex w-full items-center gap-3 text-right"
              aria-label="فتح إعدادات الملف العام"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <LayoutTemplate className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold text-emerald-700">الظهور العام للنشاط</span>
                <strong className="mt-0.5 block text-xs text-slate-950">الملف العام</strong>
                <span className="mt-1 block text-[9px] leading-5 text-slate-500">نوع النشاط، الإجراء الرئيسي، الهوية البصرية، البيانات والتواصل.</span>
              </span>
              <span className="text-lg text-slate-300">‹</span>
            </button>
          </section>

          <BusinessFinancialAccountsCenter />
        </div>
      </section>

      <BusinessManageV3 {...props} />
    </div>
  );
}
