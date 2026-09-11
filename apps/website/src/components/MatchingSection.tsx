import type { Dictionary } from '@/i18n/dictionaries';

export function MatchingSection({ dict }: { dict: Dictionary }): React.JSX.Element {
  return (
    <section className="relative bg-background py-24 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {dict.matching.eyebrow}
          </span>
          <h2 className="mt-4 text-balance font-display text-3xl leading-tight text-ink md:text-4xl">
            {dict.matching.title}
          </h2>
          <p className="mt-5 text-balance text-base leading-relaxed text-ink-muted">
            {dict.matching.body}
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute left-4 top-4 bottom-4 w-px bg-gradient-to-b from-accent via-outline-variant to-transparent md:left-1/2 md:-translate-x-1/2" />
          <div className="space-y-10 md:space-y-0">
            {dict.matching.tiers.map((tier, i) => (
              <div key={i} className="relative md:grid md:grid-cols-2 md:items-center md:gap-16 md:py-8">
                <span className="absolute left-4 top-1 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_5px_rgba(63,190,133,0.15)] md:left-1/2 md:top-1/2 md:-translate-y-1/2" />
                <div
                  className={
                    'ml-10 md:ml-0 ' +
                    (i % 2 === 0
                      ? 'md:col-start-1 md:pr-12 md:text-right'
                      : 'md:col-start-2 md:pl-12')
                  }
                >
                  <TierCard i={i} tier={tier} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TierCard({
  i,
  tier,
}: {
  i: number;
  tier: { title: string; body: string };
}): React.JSX.Element {
  return (
    <div className="inline-block rounded-2xl border border-outline-variant/60 bg-surface/60 px-5 py-4 text-left">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
        Tier {i + 1}
      </span>
      <h3 className="mt-1 font-display text-lg text-ink">{tier.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{tier.body}</p>
    </div>
  );
}
