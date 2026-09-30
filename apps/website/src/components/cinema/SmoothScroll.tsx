'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/** Inertial scrolling for the whole page — the "weight" behind every scrubbed sequence. */
export function SmoothScroll(): null {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, anchors: true });
    let raf = 0;
    const loop = (t: number): void => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}
