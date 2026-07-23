import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import ShinyText from './ShinyText';

interface Props {
  open: boolean;
  onToggle: () => void;
  title: string;
  summary: string;
  icon: LucideIcon;
  children: ReactNode;
  badge?: string;
}

export default function AnimatedDisclosure({ open, onToggle, title, summary, icon: Icon, children, badge }: Props) {
  const reduceMotion = useReducedMotion();
  return <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-right active:bg-slate-50">
      <motion.span
        animate={reduceMotion ? undefined : { scale: open ? [1, 1.08, 1] : 1 }}
        transition={{ duration: 0.28 }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"
      >
        <Icon className="h-5 w-5" />
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="min-w-0 truncate text-sm">
            <ShinyText
              text={title}
              speed={2.4}
              delay={1.2}
              color="#0f172a"
              shineColor="#10b981"
              spread={110}
              direction="left"
              pauseOnHover
            />
          </strong>
          {badge&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700">{badge}</span>}
        </span>
        <span className="mt-1 block truncate text-[10px] text-slate-500">{summary}</span>
      </span>
      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }} className="text-slate-400"><ChevronDown className="h-5 w-5" /></motion.span>
    </button>
    <AnimatePresence initial={false}>
      {open&&<motion.div
        initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      ><div className="border-t border-slate-100 p-3 sm:p-4">{children}</div></motion.div>}
    </AnimatePresence>
  </section>;
}
