import type { Dictionary } from '@/i18n/dictionaries';
import { RoutePulseBadge } from './RoutePulseBadge';
import { StoreBadges } from './StoreBadges';

export function FinalCTA({ dict }: { dict: Dictionary }): React.JSX.Element {
  return (
    <section
      id="final-cta"
      className="relative overflow-hidden bg-vaya-gradient py-28 text-center md:py-36"
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent opacity-[0.14] blur-[130px]" />
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
