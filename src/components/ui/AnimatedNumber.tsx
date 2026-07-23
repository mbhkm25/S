import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  format?: (value: number) => string;
}

export default function AnimatedNumber({
  value,
  duration = 0.65,
  suffix = '',
  prefix = '',
  className = '',
  format = (current) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(current)
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduceMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setDisplayed(value);
      return;
    }
    const controls = animate(displayed, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplayed
    });
    return () => controls.stop();
  }, [displayed, duration, inView, reduceMotion, value]);

  return (
    <motion.span ref={ref} className={className} layout="position">
      {prefix}{format(displayed)}{suffix}
    </motion.span>
  );
}
