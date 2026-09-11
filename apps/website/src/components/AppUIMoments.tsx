import type { Dictionary } from '@/i18n/dictionaries';
import { DeviceFrame } from './DeviceFrame';

const L = {
  bg: '#FFFFFF',
  surfaceMuted: '#E4EDFB',
  ink: '#14201B',
  inkMuted: '#5B6572',
  outline: '#D3E1F5',
  accent: '#2E9E6C',
  onAccent: '#0D1512',
};

const copy = {
  fr: {
    confirmed: 'Trajet confirmé',
    driver: 'Karim est en route',
    eta: 'Arrivée dans 4 min',
    pickup: 'Avenue Habib Bourguiba, arrêt 2',
    message: 'Message',
    call: 'Appeler',
  },
  en: {
    confirmed: 'Ride confirmed',
    driver: 'Karim is on the way',
    eta: 'Arriving in 4 min',
    pickup: 'Avenue Habib Bourguiba, stop 2',
    message: 'Message',
    call: 'Call',
  },
};

export function AppUIMoments({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  const t = locale === 'en' ? copy.en : copy.fr;

  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-accent opacity-[0.08] blur-[120px]" />
      <div className="relative mx-auto max-w-content px-6 text-center md:px-10">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {dict.product.eyebrow}
        </span>
        <h2 className="mx-auto mt-4 max-w-xl text-balance font-display text-3xl leading-tight text-ink md:text-4xl">
          {dict.product.title}
        </h2>
        <p className="mx-auto mt-5 max-w-md text-balance text-base leading-relaxed text-ink-muted">
          {dict.product.body}
        </p>

        <div className="relative mt-16 flex items-center justify-center">
          <div className="hidden rotate-[-9deg] scale-90 opacity-70 md:block" style={{ marginRight: '-3.5rem' }}>
            <DeviceFrame className="scale-[0.82]">
              <MiniMap />
            </DeviceFrame>
          </div>
          <div className="relative z-10">
            <DeviceFrame>
              <div className="flex h-full flex-col" style={{ background: L.bg }}>
                <div className="relative h-2/5" style={{ background: L.surfaceMuted }}>
                  <div className="absolute inset-3 rounded-xl border border-dashed" style={{ borderColor: L.outline }} />
                </div>
                <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                  <span
                    className="w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold"
                    style={{ background: L.accent, color: L.onAccent }}
                  >
                    {t.confirmed}
                  </span>
                  <p className="font-display text-sm font-semibold" style={{ color: L.ink }}>
                    {t.driver}
                  </p>
                  <p className="text-[10px]" style={{ color: L.inkMuted }}>
                    {t.eta} · {t.pickup}
                  </p>
                  <div className="mt-auto flex gap-2">
                    <div
                      className="flex-1 rounded-xl py-2 text-center text-[10px] font-semibold"
                      style={{ background: L.accent, color: L.onAccent }}
                    >
                      {t.message}
                    </div>
                    <div
                      className="flex-1 rounded-xl border py-2 text-center text-[10px] font-semibold"
                      style={{ borderColor: L.outline, color: L.ink }}
                    >
                      {t.call}
                    </div>
                  </div>
                </div>
              </div>
            </DeviceFrame>
          </div>
          <div className="hidden rotate-[9deg] scale-90 opacity-70 md:block" style={{ marginLeft: '-3.5rem' }}>
            <DeviceFrame className="scale-[0.82]">
              <MiniProfile locale={locale} />
            </DeviceFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniMap(): React.JSX.Element {
  return (
    <div className="relative h-full w-full" style={{ background: L.surfaceMuted }}>
      <svg viewBox="0 0 200 400" className="absolute inset-0 h-full w-full">
        <path d="M40 380 C 120 320 40 240 130 190 C 190 150 100 90 140 20" stroke="#7FA491" strokeWidth={3} fill="none" opacity={0.8} />
        <circle cx="40" cy="380" r="6" fill={L.ink} />
        <circle cx="140" cy="20" r="6" fill={L.accent} />
      </svg>
    </div>
  );
}

function MiniProfile({ locale }: { locale: string }): React.JSX.Element {
  const isEn = locale === 'en';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6" style={{ background: L.bg }}>
      <div className="h-16 w-16 rounded-full" style={{ background: L.surfaceMuted }} />
      <p className="font-display text-sm font-semibold" style={{ color: L.ink }}>Karim T.</p>
      <p className="text-[10px]" style={{ color: L.inkMuted }}>★ 4.95 · {isEn ? '412 trips' : '412 trajets'}</p>
      <span
        className="rounded-full px-2.5 py-1 text-[9px] font-semibold"
        style={{ background: L.accent + '20', color: L.accent }}
      >
        {isEn ? 'Top VAYA driver' : 'Conducteur Top VAYA'}
      </span>
    </div>
  );
}
