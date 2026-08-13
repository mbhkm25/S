import { useMemo, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Point = { x: number; y: number };

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export default function TouchZoomImage({ src, alt, className = '' }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const lastPinchDistance = useRef<number | null>(null);
  const lastPanPoint = useRef<Point | null>(null);

  const transform = useMemo(
    () => `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
    [offset, scale],
  );

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    lastPinchDistance.current = null;
    lastPanPoint.current = null;
  };

  const setNextScale = (next: number) => {
    const value = clamp(next, 1, 4);
    setScale(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) lastPanPoint.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastPinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
      lastPanPoint.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previous = lastPinchDistance.current;
      if (previous && previous > 0) setNextScale(scale * (distance / previous));
      lastPinchDistance.current = distance;
      return;
    }

    if (scale > 1 && lastPanPoint.current) {
      const dx = event.clientX - lastPanPoint.current.x;
      const dy = event.clientY - lastPanPoint.current.y;
      setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
      lastPanPoint.current = { x: event.clientX, y: event.clientY };
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) lastPinchDistance.current = null;
    const remaining = [...pointers.current.values()][0];
    lastPanPoint.current = remaining ?? null;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        className="relative overflow-hidden rounded-2xl bg-slate-100"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={() => setNextScale(scale > 1 ? 1 : 2)}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="mx-auto max-h-[68vh] w-full select-none object-contain transition-transform duration-75"
          style={{ transform, transformOrigin: 'center center' }}
        />
      </div>
      <div className="flex items-center justify-center gap-2" dir="ltr">
        <button type="button" onClick={() => setNextScale(scale - 0.5)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600" aria-label="تصغير">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-14 text-center text-[10px] font-bold text-slate-500">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setNextScale(scale + 0.5)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600" aria-label="تكبير">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" onClick={reset} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600" aria-label="إعادة الحجم">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-[9px] text-slate-400">يمكنك التكبير بإصبعين وتحريك الصورة أثناء التكبير.</p>
    </div>
  );
}
