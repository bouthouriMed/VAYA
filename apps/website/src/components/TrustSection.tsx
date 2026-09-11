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

/**
 * Recreated from apps/mobile/app/search/trust.tsx's real identity block +
 * stats row + trust-pills row + verifications card structure (checkmark
 * badge overlaid on the avatar, "Vérifié" pill, rating/trip stat tiles,
 * "Fiable"/"Top VAYA" pills gated on real reliabilityScore/tier logic,
 * itemized verification list) — not an invented "verified" chip.
 */
function TrustProfileMock({ locale }: { locale: string }): React.JSX.Element {
  const isEn = locale === 'en';
  return (
    <div className="mt-10 max-w-xs rounded-3xl border border-outline-variant/50 bg-background/60 p-5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-2 border-surface bg-surface-muted" />
          <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#0D1512" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-display text-base text-ink">Mehdi</p>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
              {isEn ? 'Verified' : 'Vérifié'}
            </span>
          </div>
          <p className="text-xs text-ink-muted">{isEn ? 'Speaks Arabic, French' : 'Parle arabe, français'}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-outline-variant/60 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1 text-accent">
            <StarIcon />
            <span className="text-sm font-semibold text-ink">4.9</span>
          </div>
          <p className="text-[10px] text-ink-muted">{isEn ? 'Rating' : 'Note'}</p>
        </div>
        <div className="rounded-xl border border-outline-variant/60 py-2.5 text-center">
          <span className="text-sm font-semibold text-ink">214</span>
          <p className="text-[10px] text-ink-muted">{isEn ? 'Trips' : 'Trajets'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-medium text-accent">
          {isEn ? 'Reliable' : 'Fiable'}
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-medium text-accent">
          Top VAYA
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent">
        <ShieldIcon small />
        {isEn ? 'Identity confirmed via live selfie' : 'Identité confirmée par selfie'}
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
