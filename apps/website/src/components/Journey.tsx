'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Dictionary } from '@/i18n/dictionaries';
import { JourneyFallback2D } from './JourneyFallback2D';

const JourneyScene = dynamic(
  () => import('./three/JourneyScene').then((m) => m.JourneyScene),
  { ssr: false, loading: () => null }
);

const STEP_COUNT = 6;

export function Journey({ dict }: { dict: Dictionary }): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const canGL = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        return false;
      }
    })();
    setUse3D(!reduce && wide && canGL);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const bounds = Array.from({ length: STEP_COUNT + 1 }, (_, i) => i / STEP_COUNT);

    const trigger = ScrollTrigger.create({
      trigger: wrapper,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.4,
      onUpdate: (self) => {
        progressRef.current = self.progress;
        panelRefs.current.forEach((el, i) => {
          if (!el) return;
          const start = bounds[i]!;
          const end = bounds[i + 1]!;
          const fadeInEnd = i === 0 ? start + 0.015 : start + 0.035;
          const fadeOutStart = i === STEP_COUNT - 1 ? 1 : end - 0.035;
          const fadeOutEnd = i === STEP_COUNT - 1 ? 1 : end;
          const p = self.progress;
          let opacity: number;
          if (p < start) opacity = 0;
          else if (p < fadeInEnd) opacity = (p - start) / (fadeInEnd - start);
          else if (p < fadeOutStart) opacity = 1;
          else if (p < fadeOutEnd) opacity = 1 - (p - fadeOutStart) / (fadeOutEnd - fadeOutStart);
          else opacity = i === STEP_COUNT - 1 ? 1 : 0;
          const clamped = Math.max(0, Math.min(1, opacity));
          el.style.opacity = String(clamped);
          el.style.transform = `translateY(${(1 - clamped) * 18}px)`;
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <section
      id="journey"
      ref={wrapperRef}
      className="relative bg-background"
      style={{ height: '620vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          {use3D ? (
            <JourneyScene progressRef={progressRef} />
          ) : (
            <JourneyFallback2D progressRef={progressRef} />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/80" />

        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center md:top-28">
          <span className="rounded-full border border-outline-variant/60 bg-surface/40 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted backdrop-blur-sm">
            {dict.journey.eyebrow}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 mx-auto flex max-w-content items-center px-6 md:px-10">
          {dict.journey.steps.map((step, i) => (
            <div
              key={i}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className={
                'absolute w-full max-w-md opacity-0 transition-none ' +
                (i % 2 === 0 ? 'left-0 text-left md:left-6' : 'right-0 text-left md:right-6 md:text-right')
              }
              style={i % 2 === 1 ? { marginLeft: 'auto' } : undefined}
            >
              <div className="rounded-3xl border border-outline-variant/50 bg-surface/55 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  {String(i + 1).padStart(2, '0')} — {step.label}
                </span>
                <h3 className="mt-3 font-display text-2xl leading-tight text-ink md:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted md:text-base">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
