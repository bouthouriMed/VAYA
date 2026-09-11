import type { Dictionary } from '@/i18n/dictionaries';

const icons = [ShieldIcon, StarIcon, ScaleIcon];

export function TrustSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  return (
    <section id="trust" className="relative overflow-hidden bg-surface py-24 md:py-32">
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-accent-glow opacity-20 blur-[100px]" />
      <div className="mx-auto grid max-w-content grid-cols-1 gap-16 px-6 md:grid-cols-[0.85fr_1fr] md:px-10">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {dict.trust.eyebrow}
          </span>
          <h2 className="mt-4 text-balance font-display text-3xl leading-tight text-ink md:text-4xl">
            {dict.trust.title}
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-muted">{dict.trust.body}</p>

          <TrustProfileMock locale={locale} />
        </div>

        <div className="space-y-8">
          {dict.trust.points.map((point, i) => {
            const Icon = icons[i % icons.length]!;
            return (
              <div
                key={i}
                className="flex gap-5 border-b border-outline-variant/40 pb-8 last:border-0"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon />
                </div>
                <div>
                  <h3 className="font-display text-xl text-ink">{point.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{point.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TrustProfileMock({ locale }: { locale: string }): React.JSX.Element {
  const isEn = locale === 'en';
  return (
    <div className="mt-10 max-w-xs rounded-3xl border border-outline-variant/50 bg-background/60 p-5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-surface-muted" />
        <div>
          <p className="font-display text-base text-ink">Mehdi R.</p>
          <p className="text-xs text-ink-muted">★ 4.9 · {isEn ? '214 trips' : '214 trajets'}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
        <ShieldIcon small />
        {isEn ? 'Verified via live camera' : 'Vérifié par caméra en direct'}
      </div>
    </div>
  );
}

function ShieldIcon({ small = false }: { small?: boolean }): React.JSX.Element {
  const s = small ? 14 : 20;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.8l-5.25 2.85 1-5.85L3.5 9.65l5.9-.85L12 3.5z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScaleIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v18M7 8l-4 8h8l-4-8zM17 8l-4 8h8l-4-8zM5 21h14" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
