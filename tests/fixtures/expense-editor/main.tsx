import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SanadAgentActionCard from '../../../src/features/assistant/SanadAgentActionCard';
import { current, reset, fixtureId, calls } from './mockApi';
import '../../../src/index.css';

function Preview() {
  const [generation, setGeneration] = useState(0);
  const row = current();
  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 px-4 py-6 sm:px-8" dir="rtl">
    <header className="space-y-2"><h1 className="text-xl font-semibold text-slate-950">معاينة تعديل المصروف</h1>
      <p className="text-sm leading-7 text-slate-600">بيانات اختبار معزولة. هذه هي بطاقة المسودة الفعلية؛ لا اتصال ببياناتك ولا تنفيذ مالي.</p>
      <label className="block text-sm text-slate-700">حالة الاختبار
        <select aria-label="حالة الاختبار" className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 bg-white p-2" onChange={event => { reset(event.target.value); setGeneration(value => value + 1); }}>
          <option value="normal">التعديل والحفظ</option><option value="conflict">تعارض إصدار من نافذة أخرى</option><option value="lost-response">انقطاع الرد بعد نجاح الحفظ</option><option value="collision">مسودة مطابقة نشطة</option><option value="old-server">الخادم لم يُفعّل التعديل</option><option value="wrong-thread">صلاحية لمحادثة أخرى</option><option value="empty">لا توجد حسابات</option><option value="lookup-error">تعذر تحميل الخيارات</option><option value="missing-account">الحساب السابق غير متاح</option><option value="commercial">مسودة تجارية — خارج نطاق محرر المصروف</option>
        </select></label></header>
    <div key={generation}><SanadAgentActionCard card={{ type: 'action_review', action_id: fixtureId, action_type: row.action_type, status: 'review', version: 1, title: row.review.title!, fields: [], writes_to_erp: false, risk: 'approval_required' }} /></div>
    <p className="break-all text-xs text-slate-500">معرّف الاختبار الثابت: <span dir="ltr">{fixtureId}</span></p>
  </main>;
}
// Browser assertions observe only synthetic state; never included in production entry points.
Object.assign(window, { expenseFixture: { current, calls } });
createRoot(document.getElementById('root')!).render(<Preview />);
