'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Dictionary } from '@/i18n/dictionaries';
import { JourneyFallback2D } from './JourneyFallback2D';
import { RoutePulseBadge } from './RoutePulseBadge';
import { StoreBadges } from './StoreBadges';
import { CHAPTER_COUNT } from '@/lib/curve';

const JourneyScene = dynamic(
  () => import('./three/JourneyScene').then((m) => m.JourneyScene),
  { ssr: false, loading: () => null }
);

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

    const bounds = Array.from({ length: CHAPTER_COUNT + 1 }, (_, i) => i / CHAPTER_COUNT);

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
          const fadeInEnd = i === 0 ? start + 0.008 : start + 0.02;
          const fadeOutStart = i === CHAPTER_COUNT - 1 ? 1 : end - 0.02;
          const fadeOutEnd = i === CHAPTER_COUNT - 1 ? 1 : end;
          const p = self.progress;
          let opacity: number;
          if (p < start) opacity = 0;
          else if (p < fadeInEnd) opacity = (p - start) / (fadeInEnd - start);
          else if (p < fadeOutStart) opacity = 1;
          else if (p < fadeOutEnd) opacity = 1 - (p - fadeOutStart) / (fadeOutEnd - fadeOutStart);
          else opacity = i === CHAPTER_COUNT - 1 ? 1 : 0;
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
      id="top"
      ref={wrapperRef}
      className="relative bg-background"
      style={{ height: `${CHAPTER_COUNT * 100}vh` }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          {use3D ? (
            <JourneyScene progressRef={progressRef} />
          ) : (
            <JourneyFallback2D progressRef={progressRef} />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/55 via-transparent to-background/85" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/45 via-transparent to-transparent" />

        {/* Chapter 0 — the hero, living on the same canvas as everything
            else instead of a separate flat gradient section. Bottom-left
            anchored (not centered) so the 3D scene keeps the right two
            thirds of the frame; this is the single biggest fix for the
            "feels AI generated" note — a dead-centered hero over two
            blurred gradient blobs is the single most common tell. */}
        <div
          ref={(el) => {
            panelRefs.current[0] = el;
          }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-14 md:inset-x-auto md:left-12 md:bottom-16 md:max-w-lg md:px-0 md:pb-0"
        >
          <div className="pointer-events-auto flex items-center gap-3">
            <RoutePulseBadge size={40} />
            <span className="rounded-full border border-outline-variant bg-surface/50 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted backdrop-blur-sm">
              {dict.hero.eyebrow}
            </span>
          </div>
          <h1 className="mt-5 max-w-md text-balance font-display text-4xl font-medium leading-[1.08] text-ink sm:text-5xl">
            {dict.hero.headline}
          </h1>
          <p className="mt-4 max-w-sm text-balance text-base leading-relaxed text-ink-muted">
            {dict.hero.subhead}
          </p>
          <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-4">
            <a
              id="download"
              href="#final-cta"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-ink-gradient px-7 py-3.5 font-display text-base font-medium text-on-ink shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.03]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-10 -top-6 h-[260%] w-[70%] -rotate-[20deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)] transition-transform duration-700 group-hover:translate-x-16"
              />
              {dict.hero.ctaPrimary}
            </a>
            <span className="text-xs text-ink-faint">{dict.hero.storeNote}</span>
          </div>
          <StoreBadges
            appStoreLabel={dict.finalCta.appStore}
            playLabel={dict.finalCta.googlePlay}
            className="pointer-events-auto mt-4"
          />
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 hidden flex-col items-end gap-2 text-ink-faint md:flex">
          <span className="text-[11px] uppercase tracking-[0.16em]">{dict.hero.scrollHint}</span>
          <span className="h-8 w-[1.5px] animate-pulse bg-outline-variant" />
        </div>

        {/* Chapters 1-6 — the story beats, alternating sides. */}
        <div className="pointer-events-none absolute inset-0 mx-auto flex max-w-content items-center px-6 md:px-10">
          {dict.journey.steps.map((step, i) => (
            <div
              key={i}
              ref={(el) => {
                panelRefs.current[i + 1] = el;
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
