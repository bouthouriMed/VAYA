import type { Dictionary } from '@/i18n/dictionaries';
import { RoutePulseBadge } from './RoutePulseBadge';
import { StoreBadges } from './StoreBadges';

export function FinalCTA({ dict }: { dict: Dictionary }): React.JSX.Element {
  return (
    <section
      id="final-cta"
      className="relative overflow-hidden bg-vaya-gradient py-28 text-center md:py-36"
    >
      {/* Closing echo of the journey's road/glow motif — asymmetric, not a
          centered radial blob behind centered text, so the site's last
          impression doesn't fall back into the generic-template pattern
          the hero rework just moved away from. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
        viewBox="0 0 1440 640"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          d="M -100 520 C 300 460 420 180 760 140 C 1100 100 1250 260 1560 80"
          stroke="#7FA491"
          strokeWidth={2}
          fill="none"
          opacity={0.5}
        />
        <circle cx="760" cy="140" r="5" fill="#3FBE85" />
      </svg>
      <div className="pointer-events-none absolute -right-24 -top-32 h-[380px] w-[420px] rounded-full bg-accent opacity-[0.16] blur-[120px]" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-[220px] w-[300px] rounded-full bg-accent-glow opacity-[0.14] blur-[100px]" />

      <div className="relative mx-auto max-w-2xl px-6">
        <div className="mx-auto w-fit">
          <RoutePulseBadge size={84} />
        </div>
        <h2 className="mt-8 text-balance font-display text-3xl leading-tight text-ink md:text-5xl">
          {dict.finalCta.title}
        </h2>
        <p className="mx-auto mt-4 max-w-sm text-balance text-base text-ink-muted md:text-lg">
          {dict.finalCta.body}
        </p>
        <div className="mt-10 flex justify-center">
          <StoreBadges appStoreLabel={dict.finalCta.appStore} playLabel={dict.finalCta.googlePlay} />
        </div>
      </div>
    </section>
  );
}
