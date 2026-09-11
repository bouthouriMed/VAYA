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

export function PassengerSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  return (
    <section id="passengers" className="relative overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-16 px-6 md:grid-cols-2 md:px-10">
        <div className="order-2 md:order-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {dict.passenger.eyebrow}
          </span>
          <h2 className="mt-4 max-w-md text-balance font-display text-3xl leading-tight text-ink md:text-4xl">
            {dict.passenger.title}
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">
            {dict.passenger.body}
          </p>
          <ul className="mt-8 space-y-6">
            {dict.passenger.points.map((point, i) => (
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

        <div className="order-1 flex justify-center md:order-2">
          <DeviceFrame>
            <SearchResultsMock locale={locale} />
          </DeviceFrame>
        </div>
      </div>
    </section>
  );
}

const mockCopy = {
  fr: { header: 'Sousse → Tunis · Aujourd’hui, 14:30', count: '14 trajets trouvés', badge: 'Meilleure correspondance', seats: 'places' },
  en: { header: 'Sousse → Tunis · Today, 2:30 PM', count: '14 rides found', badge: 'Best match', seats: 'seats' },
};

function SearchResultsMock({ locale }: { locale: string }): React.JSX.Element {
  const t = locale === 'en' ? mockCopy.en : mockCopy.fr;
  const rides = [
    { name: 'Youssef B.', rating: '4.9', price: '12,500', seats: 2 },
    { name: 'Amira K.', rating: '4.8', price: '11,000', seats: 1 },
    { name: 'Firas M.', rating: '5.0', price: '13,000', seats: 3 },
    { name: 'Sabrine H.', rating: '4.7', price: '12,000', seats: 2 },
    { name: 'Wael N.', rating: '4.9', price: '13,500', seats: 1 },
  ];
  return (
    <div className="flex h-full flex-col" style={{ background: L.surfaceMuted }}>
      <div className="px-4 pb-3 pt-8" style={{ background: L.surfaceMuted }}>
        <p className="text-[10px] font-medium" style={{ color: L.inkMuted }}>
          {t.header}
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: L.ink }}>
          {t.count}
        </p>
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden px-3 py-3">
        {rides.map((r, i) => (
          <div
            key={i}
            className="rounded-2xl border p-3"
            style={{ borderColor: L.outline, background: L.bg }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-full"
                  style={{ background: L.surfaceMuted }}
                />
                <div>
                  <p className="text-xs font-semibold" style={{ color: L.ink }}>
                    {r.name}
                  </p>
                  <p className="text-[10px]" style={{ color: L.inkMuted }}>
                    ★ {r.rating} · {r.seats} {t.seats}
                  </p>
                </div>
              </div>
              <p className="text-xs font-bold" style={{ color: L.ink }}>
                {r.price}
                <span className="text-[9px] font-medium"> DT</span>
              </p>
            </div>
            {i === 0 && (
              <span
                className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold"
                style={{ background: L.accent, color: L.onAccent }}
              >
                {t.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
