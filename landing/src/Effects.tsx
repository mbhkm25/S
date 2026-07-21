import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import './Effects.css';

export function RotatingText({ texts, interval = 2600 }: { texts: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion || texts.length < 2) return;
    const id = window.setInterval(() => setIndex(value => (value + 1) % texts.length), interval);
    return () => window.clearInterval(id);
  }, [interval, reduceMotion, texts.length]);
  return <span className="rotating-text" aria-live="polite" dir="rtl"><span className="effect-sr-only">{texts[index]}</span><AnimatePresence mode="wait" initial={false}><motion.span key={index} className="rotating-line" aria-hidden="true" initial={reduceMotion ? false : { y: '78%', opacity: 0, filter: 'blur(5px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={reduceMotion ? undefined : { y: '-85%', opacity: 0, filter: 'blur(5px)' }} transition={{ type: 'spring', damping: 30, stiffness: 360 }}>{texts[index]}</motion.span></AnimatePresence></span>;
}

export function GradientText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`gradient-text ${className}`}>{children}</span>;
}

export function ShinyText({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`shiny-text ${className}`}>{text}</span>;
}

export function CountUp({ to, className = '' }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const value = useMotionValue(0);
  const spring = useSpring(value, { damping: 30, stiffness: 85 });
  useEffect(() => { if (inView) value.set(to); }, [inView, to, value]);
  useEffect(() => spring.on('change', latest => { if (ref.current) ref.current.textContent = new Intl.NumberFormat('en-US').format(Math.round(latest)); }), [spring]);
  return <span ref={ref} className={className}>0</span>;
}

export function RevealCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: .18 });
  const reduceMotion = useReducedMotion();
  return <motion.div ref={ref} className={className} initial={reduceMotion ? false : { opacity: 0, y: 28, scale: .975 }} animate={inView ? { opacity: 1, y: 0, scale: 1 } : undefined} transition={{ duration: .55, ease: [.22, 1, .36, 1] }}>{children}</motion.div>;
}
