'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onFrame(p)` every animation frame with the smoothed scroll progress
 * [0..1] of a tall section whose inner content is `position: sticky`.
 */
export function useSectionProgress(
  ref: RefObject<HTMLElement | null>,
  onFrame: (p: number) => void,
  smoothing = 0.18,
): void {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let current = -1;
    let raf = 0;
    const tick = (): void => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const target = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      current = current < 0 ? target : current + (target - current) * smoothing;
      if (Math.abs(target - current) < 0.0005) current = target;
      // skip work while far off-screen
      if (rect.bottom > -200 && rect.top < window.innerHeight + 200) cb.current(current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, smoothing]);
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** progress of p inside [a,b], clamped */
export const range = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
