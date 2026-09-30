'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';

export type Beat = {
  /** scroll progress window [0..1] in which this beat is visible */
  from: number;
  to: number;
  /** visible at progress 0 without fading in (first beat) */
  holdStart?: boolean;
  /** stays visible through progress 1 (last beat) */
  holdEnd?: boolean;
  position?: 'center' | 'left' | 'right' | 'bottom' | 'top' | 'bottomLeft';
  children: ReactNode;
};

type Props = {
  /** folder under /public/sequences */
  name: string;
  frames: number;
  /** total scroll length of the pinned section, in viewport heights */
  lengthVh?: number;
  beats?: Beat[];
  /** decorative layer painted behind the canvas (glows, gradients) */
  backdrop?: ReactNode;
  className?: string;
  id?: string;
  /** called every frame with scroll progress — for extra choreography */
  onProgress?: (p: number) => void;
  /** extra CSS transform on the canvas; may use var(--p) */
  canvasTransform?: string;
  /** on portrait screens, the render's x (0..1) to keep centred */
  focusX?: number;
};

const pad = (n: number): string => String(n).padStart(4, '0');

/** Coarse-to-fine load order: every 16th frame first, then 8th, 4th… */
function loadOrder(count: number): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (let stride = 16; stride >= 1; stride /= 2) {
    for (let i = 0; i < count; i += stride) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
  }
  if (!seen.has(count - 1)) order.push(count - 1);
  return order;
}

function envelope(p: number, b: Beat): number {
  const span = b.to - b.from;
  const ramp = Math.min(0.25 * span, 0.06);
  if (p < b.from || p > b.to) {
    if (b.holdStart && p < b.from) return 1;
    if (b.holdEnd && p > b.to) return 1;
    return 0;
  }
  const inT = b.holdStart ? 1 : Math.min(1, (p - b.from) / ramp);
  const outT = b.holdEnd ? 1 : Math.min(1, (b.to - p) / ramp);
  return Math.max(0, Math.min(inT, outT));
}

const positionClass: Record<NonNullable<Beat['position']>, string> = {
  center: 'inset-0 items-center justify-center text-center',
  top: 'inset-x-0 top-[14vh] justify-center text-center',
  bottom: 'inset-x-0 bottom-[9vh] justify-center text-center',
  left: 'inset-y-0 left-0 items-end pb-[7vh] md:items-center md:pb-0 md:pl-[7vw] text-left',
  bottomLeft: 'inset-y-0 left-0 items-end pb-[7vh] md:pb-[13vh] md:pl-[7vw] text-left',
  right: 'inset-y-0 right-0 items-end pb-[7vh] md:items-center md:pb-0 md:pr-[7vw] text-left md:justify-end',
};

export function ScrollSequence({
  name,
  frames,
  lengthVh = 400,
  beats = [],
  backdrop,
  className,
  id,
  onProgress,
  canvasTransform,
  focusX = 0.5,
}: Props): React.JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const images: (HTMLImageElement | null)[] = new Array(frames).fill(null);
    let cancelled = false;
    let drawn = -1;
    let current = 0; // smoothed frame position
    let raf = 0;

    // load frames, a few in flight at a time, coarse-to-fine
    const queue = loadOrder(frames);
    const inFlight = 6;
    const next = (): void => {
      const i = queue.shift();
      if (i === undefined || cancelled) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = `/sequences/${name}/${pad(i + 1)}.webp`;
      img.onload = () => {
        images[i] = img;
        drawn = -1; // a better frame may now be available
        next();
      };
      img.onerror = next;
    };
    for (let k = 0; k < inFlight; k++) next();

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawn = -1;
    };
    resize();
    window.addEventListener('resize', resize);

    const nearestLoaded = (i: number): HTMLImageElement | null => {
      for (let d = 0; d < frames; d++) {
        const a = images[i - d];
        if (a) return a;
        const b = images[i + d];
        if (b) return b;
      }
      return null;
    };

    const draw = (i: number): void => {
      const img = nearestLoaded(i);
      if (!img) return;
      const cw = canvas.width;
      const ch = canvas.height;
      // cover-fit; on portrait screens shrink and lift the subject so text fits below
      const portrait = cw / ch < 0.8;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * (portrait ? 0.56 : 1);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      const cy = portrait ? ch * 0.34 : ch / 2;
      ctx.clearRect(0, 0, cw, ch);
      const x = portrait ? Math.min(0, Math.max(cw - w, cw / 2 - focusX * w)) : (cw - w) / 2;
      ctx.drawImage(img, x, cy - h / 2, w, h);
    };

    const tick = (): void => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const target = p * (frames - 1);
      current += (target - current) * 0.2;
      if (Math.abs(target - current) < 0.01) current = target;
      const idx = Math.round(current);
      if (idx !== drawn) {
        draw(idx);
        if (images[idx]) drawn = idx;
      }
      const smoothP = current / (frames - 1);
      beats.forEach((b, k) => {
        const el = beatRefs.current[k];
        if (!el) return;
        const o = envelope(smoothP, b);
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0, ${(1 - o) * 28}px, 0)`;
        el.style.filter = o < 1 ? `blur(${(1 - o) * 8}px)` : 'none';
        el.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
      });
      section.style.setProperty('--p', smoothP.toFixed(4));
      onProgressRef.current?.(smoothP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [name, frames, beats, focusX]);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={clsx('relative', className)}
      style={{ height: `${lengthVh}vh` }}
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        {backdrop}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full will-change-transform"
          style={canvasTransform ? { transform: canvasTransform } : undefined}
          aria-hidden
        />
        {beats.map((b, k) => (
          <div
            key={k}
            ref={(el) => {
              beatRefs.current[k] = el;
            }}
            className={clsx(
              'pointer-events-none absolute flex px-6 will-change-transform [&_a]:pointer-events-auto [&_button]:pointer-events-auto',
              positionClass[b.position ?? 'center'],
            )}
            style={{ opacity: b.holdStart ? 1 : 0 }}
          >
            {b.children}
          </div>
        ))}
      </div>
    </section>
  );
}
