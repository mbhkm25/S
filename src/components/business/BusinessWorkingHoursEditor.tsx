import { motion, useReducedMotion } from 'motion/react';
import { Clock3, Copy, Moon, Save, SunMedium } from 'lucide-react';
import {
  BUSINESS_DAYS,
  copyWorkingDayToAll,
  setWorkingDayMode,
  setWorkingPeriod,
  updateWorkingDay,
  workingDaySummary,
  type BusinessWorkingHours
} from '../../lib/businessWorkingHours';

interface Props {
  hours: BusinessWorkingHours;
  saving: boolean;
  onChange: (hours: BusinessWorkingHours) => void;
  onSave: () => void;
}

export default function BusinessWorkingHoursEditor({ hours, saving, onChange, onSave }: Props) {
  const reduceMotion = useReducedMotion();

  return <section className="space-y-4 rounded-[1.8rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Clock3 className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-slate-950">إدارة ساعات العمل والدوام</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">حدد دوامًا متواصلًا أو فترتين صباحية ومسائية لكل يوم. تنعكس الحالة مباشرة على الملف العام.</p></div>
    </div>

    <div className="space-y-3">{BUSINESS_DAYS.map(([key, label], index) => {
      const day = hours[key];
      return <motion.article
        key={key}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: 0.25 }}
        className={`overflow-hidden rounded-2xl border ${day.closed ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1"><strong className="block text-xs text-slate-950">{label}</strong><span className="mt-1 block text-[9px] text-slate-500">{workingDaySummary(day)}</span></div>
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={day.closed} onChange={event=>onChange(updateWorkingDay(hours,key,current=>({...current,closed:event.target.checked})))} />مغلق</label>
        </div>
        {!day.closed&&<div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>onChange(setWorkingDayMode(hours,key,'continuous'))} className={`rounded-xl border p-2.5 text-[10px] font-bold ${day.mode==='continuous'?'border-slate-900 bg-slate-900 text-white':'border-slate-200 bg-slate-50 text-slate-600'}`}>دوام متواصل</button>
            <button type="button" onClick={()=>onChange(setWorkingDayMode(hours,key,'split'))} className={`rounded-xl border p-2.5 text-[10px] font-bold ${day.mode==='split'?'border-slate-900 bg-slate-900 text-white':'border-slate-200 bg-slate-50 text-slate-600'}`}>فترتان</button>
          </div>
          {day.periods.map((period, periodIndex)=><div key={periodIndex} className="grid grid-cols-[auto_1fr_1fr] items-end gap-2 rounded-xl bg-slate-50 p-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600">{periodIndex===0?<SunMedium className="h-4 w-4"/>:<Moon className="h-4 w-4"/>}</span>
            <label className="space-y-1 text-[9px] font-bold text-slate-500">من<input type="time" value={period.open} onChange={event=>onChange(setWorkingPeriod(hours,key,periodIndex,'open',event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs" /></label>
            <label className="space-y-1 text-[9px] font-bold text-slate-500">إلى<input type="time" value={period.close} onChange={event=>onChange(setWorkingPeriod(hours,key,periodIndex,'close',event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs" /></label>
          </div>)}
          <button type="button" onClick={()=>onChange(copyWorkingDayToAll(hours,key))} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-2.5 text-[9px] font-bold text-slate-600"><Copy className="h-3.5 w-3.5"/>تطبيق ساعات {label} على جميع الأيام</button>
        </div>}
      </motion.article>;
    })}</div>

    <button type="button" onClick={onSave} disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white disabled:bg-slate-300"><Save className="h-4 w-4"/>{saving?'جارٍ الحفظ...':'حفظ ساعات العمل والدوام'}</button>
  </section>;
}
