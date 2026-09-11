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

const mockCopy = {
  fr: {
    title: 'Fixez votre prix',
    hint: 'Fourchette calculée sur la distance réelle',
    min: 'Min',
    rec: 'Recommandé',
    max: 'Max',
    per: '/ place',
    route: 'Sousse → Tunis · 142 km',
    seatsLabel: 'places libres',
    stopsLabel: 'arrêts suggérés',
  },
  en: {
    title: 'Set your price',
    hint: 'Range computed from the real distance',
    min: 'Min',
    rec: 'Recommended',
    max: 'Max',
    per: '/ seat',
    route: 'Sousse → Tunis · 142 km',
    seatsLabel: 'seats open',
    stopsLabel: 'suggested stops',
  },
};

export function DriverSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  const t = locale === 'en' ? mockCopy.en : mockCopy.fr;
  return (
    <section id="drivers" className="relative overflow-hidden bg-surface py-24 md:py-32">
      <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-16 px-6 md:grid-cols-2 md:px-10">
        <div className="flex justify-center">
          <DeviceFrame>
            <div className="flex h-full flex-col" style={{ background: L.bg }}>
              <div className="relative h-24 shrink-0" style={{ background: L.surfaceMuted }}>
                <svg viewBox="0 0 260 96" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <path
                    d="M20 80 C 90 60 70 30 140 26 C 190 22 210 40 240 18"
                    stroke="#7FA491"
                    strokeWidth={2.5}
                    fill="none"
                    opacity={0.85}
                  />
                  <circle cx="20" cy="80" r="4" fill={L.ink} />
                  <circle cx="240" cy="18" r="4" fill={L.accent} />
                </svg>
                <div className="absolute inset-x-0 bottom-0 px-4 pb-2.5">
                  <p className="text-[10px] font-medium" style={{ color: L.inkMuted }}>
                    {t.route}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold" style={{ color: L.ink }}>
                    {t.title}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-5 px-5">
                <p className="text-center text-[10px]" style={{ color: L.inkMuted }}>
                  {t.hint}
                </p>
                <div className="flex items-end justify-center gap-1">
                  <span className="text-3xl font-bold" style={{ color: L.ink }}>
                    12,500
                  </span>
                  <span className="mb-1 text-xs" style={{ color: L.inkMuted }}>
                    DT {t.per}
                  </span>
                </div>
                <div className="relative h-2 rounded-full" style={{ background: L.outline }}>
                  <div
                    className="absolute inset-y-0 left-[22%] right-[30%] rounded-full"
                    style={{ background: L.accent }}
                  />
                  <div
                    className="absolute -top-1 h-4 w-4 rounded-full border-2 left-[48%]"
                    style={{ background: '#FFFFFF', borderColor: L.accent }}
                  />
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: L.inkMuted }}>
                  <span>{t.min} · 10,200</span>
                  <span style={{ color: L.accent, fontWeight: 600 }}>{t.rec}</span>
                  <span>{t.max} · 14,800</span>
                </div>
                <div className="mt-2 flex gap-2 border-t pt-4" style={{ borderColor: L.outline }}>
                  <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: L.surfaceMuted }}>
                    <p className="text-sm font-semibold" style={{ color: L.ink }}>3</p>
                    <p className="text-[9px]" style={{ color: L.inkMuted }}>{t.seatsLabel}</p>
                  </div>
                  <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: L.surfaceMuted }}>
                    <p className="text-sm font-semibold" style={{ color: L.ink }}>4</p>
                    <p className="text-[9px]" style={{ color: L.inkMuted }}>{t.stopsLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          </DeviceFrame>
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {dict.driver.eyebrow}
          </span>
          <h2 className="mt-4 max-w-md text-balance font-display text-3xl leading-tight text-ink md:text-4xl">
            {dict.driver.title}
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">{dict.driver.body}</p>
          <ul className="mt-8 space-y-6">
            {dict.driver.points.map((point, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg text-ink">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
