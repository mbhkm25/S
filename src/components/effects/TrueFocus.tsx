import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './TrueFocus.css';

type TrueFocusProps = {
  sentence?: string;
  separator?: string;
  manualMode?: boolean;
  blurAmount?: number;
  borderColor?: string;
  glowColor?: string;
  animationDuration?: number;
  pauseBetweenAnimations?: number;
  className?: string;
};

type FocusRect = { left: number; top: number; width: number; height: number };

type TrueFocusStyle = CSSProperties & {
  '--true-focus-border': string;
  '--true-focus-glow': string;
};

export default function TrueFocus({
  sentence = 'True Focus',
  separator = ' ',
  manualMode = false,
  blurAmount = 2,
  borderColor = '#ffffff',
  glowColor = 'rgba(255,255,255,0.45)',
  animationDuration = 0.65,
  pauseBetweenAnimations = 1.35,
  className = ''
}: TrueFocusProps) {
  const words = useMemo(() => sentence.split(separator).filter(Boolean), [sentence, separator]);
  const reducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastActiveIndex, setLastActiveIndex] = useState(0);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [focusRect, setFocusRect] = useState<FocusRect>({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    if (manualMode || reducedMotion || words.length < 2) return;
    const interval = window.setInterval(
      () => setCurrentIndex((previous) => (previous + 1) % words.length),
      (animationDuration + pauseBetweenAnimations) * 1000
    );
    return () => window.clearInterval(interval);
  }, [animationDuration, manualMode, pauseBetweenAnimations, reducedMotion, words.length]);

  useLayoutEffect(() => {
    const updateRect = () => {
      const container = containerRef.current;
      const activeWord = wordRefs.current[currentIndex];
      if (!container || !activeWord) return;

      setFocusRect({
        left: activeWord.offsetLeft,
        top: activeWord.offsetTop,
        width: activeWord.offsetWidth,
        height: activeWord.offsetHeight
      });
    };

    updateRect();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateRect)
      : null;

    if (observer) {
      observer.observe(containerRef.current);
      wordRefs.current.forEach((word) => {
        if (word) observer.observe(word);
      });
    }

    window.addEventListener('resize', updateRect);
    document.fonts?.ready.then(updateRect).catch(() => undefined);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateRect);
    };
  }, [currentIndex, words.length]);

  const handleMouseEnter = (index: number) => {
    if (!manualMode) return;
    setLastActiveIndex(currentIndex);
    setCurrentIndex(index);
  };

  const handleMouseLeave = () => {
    if (manualMode) setCurrentIndex(lastActiveIndex);
  };

  const containerStyle: TrueFocusStyle = {
    '--true-focus-border': borderColor,
    '--true-focus-glow': glowColor
  };

  return (
    <span
      ref={containerRef}
      className={`true-focus-container ${className}`.trim()}
      aria-label={sentence}
      style={containerStyle}
    >
      {words.map((word, index) => {
        const active = Boolean(reducedMotion) || index === currentIndex;
        return (
          <span
            key={`${word}-${index}`}
            ref={(element) => { wordRefs.current[index] = element; }}
            className={`true-focus-word ${active ? 'is-active' : ''}`}
            style={{
              filter: active ? 'blur(0)' : `blur(${blurAmount}px)`,
              transitionDuration: `${animationDuration}s`
            }}
            aria-hidden="true"
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
          >
            {word}
          </span>
        );
      })}

      {!reducedMotion && words.length > 0 && (
        <motion.span
          className="true-focus-frame"
          animate={{
            left: focusRect.left,
            top: focusRect.top,
            width: focusRect.width,
            height: focusRect.height,
            opacity: 1
          }}
          transition={{ duration: animationDuration, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <span className="true-focus-corner true-focus-top-left" />
          <span className="true-focus-corner true-focus-top-right" />
          <span className="true-focus-corner true-focus-bottom-left" />
          <span className="true-focus-corner true-focus-bottom-right" />
        </motion.span>
      )}
    </span>
  );
}
