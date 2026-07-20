import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type TargetAndTransition,
  type VariantLabels
} from 'motion/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type HTMLAttributes
} from 'react';
import './RotatingText.css';

type SplitBy = 'characters' | 'words' | 'lines' | string;
type StaggerFrom = 'first' | 'last' | 'center' | 'random' | number;
type PresenceMode = 'sync' | 'wait' | 'popLayout';

type RotatingTextHandle = {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
};

type RotatingTextProps = Omit<HTMLAttributes<HTMLSpanElement>, 'onNext'> & {
  texts: string[];
  rotationInterval?: number;
  initial?: TargetAndTransition | VariantLabels;
  animate?: TargetAndTransition | VariantLabels;
  exit?: TargetAndTransition | VariantLabels;
  animatePresenceMode?: PresenceMode;
  animatePresenceInitial?: boolean;
  staggerDuration?: number;
  staggerFrom?: StaggerFrom;
  transition?: Transition;
  loop?: boolean;
  auto?: boolean;
  splitBy?: SplitBy;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
};

type SplitGroup = { elements: string[]; needsSpace: boolean };

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const Segmenter = Intl.Segmenter;
    const segmenter = new Segmenter('ar', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

const RotatingText = forwardRef<RotatingTextHandle, RotatingTextProps>((props, ref) => {
  const {
    texts,
    transition = { type: 'spring', damping: 28, stiffness: 360 },
    initial = { y: '105%', opacity: 0 },
    animate = { y: 0, opacity: 1 },
    exit = { y: '-105%', opacity: 0 },
    animatePresenceMode = 'wait',
    animatePresenceInitial = false,
    rotationInterval = 2600,
    staggerDuration = 0.018,
    staggerFrom = 'last',
    loop = true,
    auto = true,
    splitBy = 'words',
    onNext,
    mainClassName,
    splitLevelClassName,
    elementLevelClassName,
    className,
    ...rest
  } = props;

  const safeTexts = useMemo(() => texts.map((text) => text.trim()).filter(Boolean), [texts]);
  const reducedMotion = useReducedMotion();
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    if (currentTextIndex < safeTexts.length) return;
    setCurrentTextIndex(0);
  }, [currentTextIndex, safeTexts.length]);

  const groups = useMemo<SplitGroup[]>(() => {
    const currentText = safeTexts[currentTextIndex] ?? '';
    if (splitBy === 'characters') {
      const words = currentText.split(' ');
      return words.map((word, index) => ({
        elements: splitGraphemes(word),
        needsSpace: index !== words.length - 1
      }));
    }
    if (splitBy === 'words') {
      const words = currentText.split(' ');
      return words.map((word, index) => ({ elements: [word], needsSpace: index !== words.length - 1 }));
    }
    if (splitBy === 'lines') {
      const lines = currentText.split('\n');
      return lines.map((line, index) => ({ elements: [line], needsSpace: index !== lines.length - 1 }));
    }
    const parts = currentText.split(splitBy);
    return parts.map((part, index) => ({ elements: [part], needsSpace: index !== parts.length - 1 }));
  }, [currentTextIndex, safeTexts, splitBy]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setCurrentTextIndex(newIndex);
    onNext?.(newIndex);
  }, [onNext]);

  const next = useCallback(() => {
    if (safeTexts.length < 2) return;
    const nextIndex = currentTextIndex === safeTexts.length - 1
      ? (loop ? 0 : currentTextIndex)
      : currentTextIndex + 1;
    if (nextIndex !== currentTextIndex) handleIndexChange(nextIndex);
  }, [currentTextIndex, handleIndexChange, loop, safeTexts.length]);

  const previous = useCallback(() => {
    if (safeTexts.length < 2) return;
    const previousIndex = currentTextIndex === 0
      ? (loop ? safeTexts.length - 1 : currentTextIndex)
      : currentTextIndex - 1;
    if (previousIndex !== currentTextIndex) handleIndexChange(previousIndex);
  }, [currentTextIndex, handleIndexChange, loop, safeTexts.length]);

  const jumpTo = useCallback((index: number) => {
    if (!safeTexts.length) return;
    const validIndex = Math.max(0, Math.min(index, safeTexts.length - 1));
    if (validIndex !== currentTextIndex) handleIndexChange(validIndex);
  }, [currentTextIndex, handleIndexChange, safeTexts.length]);

  const reset = useCallback(() => {
    if (currentTextIndex !== 0) handleIndexChange(0);
  }, [currentTextIndex, handleIndexChange]);

  useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

  useEffect(() => {
    if (!auto || reducedMotion || safeTexts.length < 2) return;
    const intervalId = window.setInterval(next, rotationInterval);
    return () => window.clearInterval(intervalId);
  }, [auto, next, reducedMotion, rotationInterval, safeTexts.length]);

  const totalElements = groups.reduce((sum, group) => sum + group.elements.length, 0);
  const getDelay = (index: number) => {
    if (!staggerDuration || totalElements < 2) return 0;
    if (staggerFrom === 'first') return index * staggerDuration;
    if (staggerFrom === 'last') return (totalElements - 1 - index) * staggerDuration;
    if (staggerFrom === 'center') return Math.abs(Math.floor(totalElements / 2) - index) * staggerDuration;
    if (staggerFrom === 'random') return Math.abs(Math.floor(totalElements / 2) - index) * staggerDuration;
    return Math.abs(staggerFrom - index) * staggerDuration;
  };

  const visibleText = safeTexts[currentTextIndex] ?? '';
  if (!visibleText) return null;

  if (reducedMotion) {
    return <span className={joinClasses('rotating-text', mainClassName, className)} {...rest}>{visibleText}</span>;
  }

  return (
    <motion.span
      className={joinClasses('rotating-text', mainClassName, className)}
      layout
      transition={transition}
      {...rest}
    >
      <span className="rotating-text-sr-only" aria-live="polite">{visibleText}</span>
      <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
        <motion.span
          key={currentTextIndex}
          className={splitBy === 'lines' ? 'rotating-text-lines' : 'rotating-text-content'}
          aria-hidden="true"
        >
          {groups.map((group, groupIndex) => {
            const previousCount = groups
              .slice(0, groupIndex)
              .reduce((sum, previousGroup) => sum + previousGroup.elements.length, 0);
            return (
              <span key={`${groupIndex}-${group.elements.join('')}`} className={joinClasses('rotating-text-word', splitLevelClassName)}>
                {group.elements.map((element, elementIndex) => (
                  <motion.span
                    key={`${element}-${elementIndex}`}
                    initial={initial}
                    animate={animate}
                    exit={exit}
                    transition={{ ...transition, delay: getDelay(previousCount + elementIndex) }}
                    className={joinClasses('rotating-text-element', elementLevelClassName)}
                  >
                    {element}
                  </motion.span>
                ))}
                {group.needsSpace && <span className="rotating-text-space"> </span>}
              </span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
});

RotatingText.displayName = 'RotatingText';

export default RotatingText;
