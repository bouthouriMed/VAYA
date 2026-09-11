'use client';

import type { Dictionary } from '@/i18n/dictionaries';
import { RoutePulseBadge } from './RoutePulseBadge';
import { StoreBadges } from './StoreBadges';

export function Hero({ dict }: { dict: Dictionary }): React.JSX.Element {
  return (
    <section
      id="top"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-vaya-gradient px-6"
    >
      <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-full bg-accent-glow opacity-30 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-accent opacity-[0.16] blur-[110px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(63,190,133,0.08),transparent_60%)]" />

      <div className="relative z-10 flex max-w-2xl flex-col items-center pt-20 text-center md:pt-24">
        <span className="mb-4 rounded-full border border-outline-variant bg-surface/50 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted backdrop-blur-sm animate-fade-up md:mb-6">
          {dict.hero.eyebrow}
        </span>

        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <RoutePulseBadge size={72} className="md:hidden" />
          <RoutePulseBadge size={104} className="hidden md:block" />
        </div>

        <h1
          className="mt-5 text-balance font-display text-[2.1rem] font-medium leading-[1.1] text-ink animate-fade-up sm:text-5xl md:mt-8 md:text-6xl"
          style={{ animationDelay: '160ms' }}
        >
          {dict.hero.headline}
        </h1>
        <p
          className="mt-4 max-w-md text-balance text-sm leading-relaxed text-ink-muted animate-fade-up md:mt-5 md:text-lg"
          style={{ animationDelay: '240ms' }}
        >
          {dict.hero.subhead}
        </p>

        <div
          className="mt-6 flex flex-col items-center gap-3 animate-fade-up md:mt-9 md:gap-4"
          style={{ animationDelay: '320ms' }}
        >
          <a
            id="download"
            href="#final-cta"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-ink-gradient px-8 py-3.5 font-display text-base font-medium text-on-ink shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.03] md:py-4"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-10 -top-6 h-[260%] w-[70%] -rotate-[20deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)] transition-transform duration-700 group-hover:translate-x-16"
            />
            {dict.hero.ctaPrimary}
            <ArrowIcon />
          </a>
          <a
            href="#journey"
            className="text-sm font-medium text-ink-muted underline decoration-outline-variant underline-offset-4 transition-colors hover:text-ink"
          >
            {dict.hero.ctaSecondary}
          </a>
        </div>

        <p className="mt-4 text-xs text-ink-faint animate-fade-up md:mt-6" style={{ animationDelay: '380ms' }}>
          {dict.hero.storeNote}
        </p>
        <StoreBadges
          appStoreLabel={dict.finalCta.appStore}
          playLabel={dict.finalCta.googlePlay}
          className="mt-3 animate-fade-up md:mt-4"
        />
      </div>

      <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-ink-faint md:flex">
        <span className="text-[11px] uppercase tracking-[0.16em]">{dict.hero.scrollHint}</span>
        <span className="h-8 w-[1.5px] animate-pulse bg-outline-variant" />
      </div>
    </section>
  );
}

function ArrowIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
