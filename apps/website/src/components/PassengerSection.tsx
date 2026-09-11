import type { Dictionary } from '@/i18n/dictionaries';
import { DeviceFrame } from './DeviceFrame';

/**
 * Exact `lightPalette` values from packages/design-system/src/theme/palette.ts
 * — this recreation is built directly against the real `DriverListCard`
 * primitive's source (packages/design-system/src/primitives/DriverListCard.tsx)
 * and `apps/mobile/app/search/results.tsx`'s screen chrome, not an invented
 * approximation. No Expo web build is reachable in this sandboxed
 * environment (react-native-maps breaks web bundling app-wide — a real,
 * pre-existing limitation of the mobile codebase, not something this pass
 * patches), so this is a faithful structural/token-accurate recreation
 * rather than a literal screenshot.
 */
const L = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#E4EDFB',
  ink: '#14201B',
  inkMuted: '#5B6572',
  inkFaint: '#8B93A3',
  outline: '#D3E1F5',
  outlineVariant: '#E4EDFB',
  accent: '#2E9E6C',
  accentStrong: '#22794F',
  accentGlow: '#8FD9B4',
  onAccent: '#0D1512',
  info: '#4A7C8C',
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
  fr: {
    title: 'Sousse → Tunis',
    date: "Aujourd'hui, 14:30",
    toggle: 'Carte',
    bestMatch: 'MEILLEURE CORRESPONDANCE',
    onRoute: 'Sur votre trajet',
    pickupWalk: '4 min',
    dropoffWalk: '6 min',
  },
  en: {
    title: 'Sousse → Tunis',
    date: 'Today, 2:30 PM',
    toggle: 'Map',
    bestMatch: 'BEST MATCH',
    onRoute: 'On your route',
    pickupWalk: '4 min',
    dropoffWalk: '6 min',
  },
};

const rides = [
  {
    time: '14:32',
    price: '12,500 DT',
    name: 'Youssef B.',
    rating: '4.9',
    pickup: 'Sousse',
    pickupPlace: 'Avenue Habib Bourguiba',
    dropoff: 'Tunis',
    dropoffPlace: 'Bab Saadoun',
    routeBadge: true,
    seats: 2,
  },
  {
    time: '14:50',
    price: '11,000 DT',
    name: 'Amira K.',
    rating: '4.8',
    pickup: 'Sousse',
    pickupPlace: 'Sahloul',
    dropoff: 'Tunis',
    dropoffPlace: 'Centre Ville',
    routeBadge: false,
    seats: 1,
  },
  {
    time: '15:10',
    price: '13,000 DT',
    name: 'Firas M.',
    rating: '5.0',
    pickup: 'Sousse',
    pickupPlace: 'Khzema',
    dropoff: 'Tunis',
    dropoffPlace: 'Lac 2',
    routeBadge: false,
    seats: 3,
  },
];

function SearchResultsMock({ locale }: { locale: string }): React.JSX.Element {
  const t = locale === 'en' ? mockCopy.en : mockCopy.fr;
  return (
    <div className="flex h-full flex-col" style={{ background: L.background }}>
      {/* Real screen header: back chevron + centered origin → destination title */}
      <div
        className="flex items-center justify-between px-3 pb-2.5 pt-8"
        style={{ background: L.surface, borderBottom: `1px solid ${L.outlineVariant}` }}
      >
        <ChevronIcon />
        <p className="text-[11px] font-semibold" style={{ color: L.ink }}>
          {t.title}
        </p>
        <span style={{ width: 16 }} />
      </div>
      {/* Subheader: date badge + list/map toggle pill */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          <CalendarIcon />
          <span className="text-[9px]" style={{ color: L.inkMuted }}>
            {t.date}
          </span>
        </div>
        <div
          className="flex items-center gap-1 rounded-full px-2 py-1"
          style={{ border: `1px solid ${L.outline}` }}
        >
          <MapIcon />
          <span className="text-[9px]" style={{ color: L.ink }}>
            {t.toggle}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-hidden px-3 pb-3 pt-1">
        {rides.map((r, i) => (
          <div key={i}>
            {i === 0 && (
              <div className="mb-1 flex items-center gap-1 px-1">
                <StarIcon color={L.info} />
                <span
                  className="text-[8px] font-bold"
                  style={{ color: L.info, letterSpacing: '0.5px' }}
                >
                  {t.bestMatch}
                </span>
              </div>
            )}
            <div
              className="rounded-2xl p-3"
              style={{ background: L.surface, border: `1px solid ${L.outlineVariant}` }}
            >
              <div className="flex items-baseline justify-between">
                <p className={i === 0 ? 'text-base font-bold' : 'text-sm font-bold'} style={{ color: L.ink }}>
                  {r.time}
                </p>
                <p className={i === 0 ? 'text-sm font-bold' : 'text-xs font-semibold'} style={{ color: L.accent }}>
                  {r.price}
                </p>
              </div>

              {r.routeBadge && (
                <div
                  className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{ background: L.accentGlow + '40' }}
                >
                  <RouteIcon color={L.accentStrong} />
                  <span className="text-[8px] font-semibold" style={{ color: L.accentStrong }}>
                    {t.onRoute}
                  </span>
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <div className="flex w-2.5 shrink-0 flex-col items-center pt-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: L.ink }} />
                  <span className="my-0.5 w-px flex-1" style={{ background: L.outlineVariant, minHeight: 14 }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: L.accent }} />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-semibold" style={{ color: L.ink }}>
                      {r.pickup}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-px text-[8px]"
                      style={{ background: L.accentGlow + '40', color: L.accentStrong }}
                    >
                      {t.pickupWalk}
                    </span>
                  </div>
                  <p className="-mt-1 text-[9px]" style={{ color: L.inkMuted }}>
                    {r.pickupPlace}
                  </p>
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <p className="text-[11px] font-semibold" style={{ color: L.ink }}>
                      {r.dropoff}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-px text-[8px]"
                      style={{ background: L.accentGlow + '40', color: L.accentStrong }}
                    >
                      {t.dropoffWalk}
                    </span>
                  </div>
                  <p className="-mt-1 text-[9px]" style={{ color: L.inkMuted }}>
                    {r.dropoffPlace}
                  </p>
                </div>
              </div>

              <div className="my-2 h-px" style={{ background: L.outlineVariant }} />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-6 w-6 rounded-full" style={{ background: L.surfaceMuted }} />
                  <div>
                    <p className="text-[10px] font-semibold" style={{ color: L.ink }}>
                      {r.name}
                    </p>
                    <div className="flex items-center gap-0.5">
                      <StarIcon color={L.accent} small />
                      <span className="text-[9px]" style={{ color: L.inkMuted }}>
                        {r.rating}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex">
                  {Array.from({ length: Math.min(r.seats, 3) }).map((_, si) => (
                    <div
                      key={si}
                      className="h-4 w-4 rounded-full"
                      style={{
                        background: L.surfaceMuted,
                        border: `1.5px solid ${L.surface}`,
                        marginLeft: si === 0 ? 0 : -6,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke={L.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={L.inkMuted} strokeWidth={1.8} />
      <path d="M3 10h18M8 3v4M16 3v4" stroke={L.inkMuted} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
function MapIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke={L.ink} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}
function RouteIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke={color} strokeWidth={1.8} />
      <circle cx="18" cy="18" r="2.5" stroke={color} strokeWidth={1.8} />
      <path d="M8 7l8 10" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}
function StarIcon({ color, small = false }: { color: string; small?: boolean }): React.JSX.Element {
  const s = small ? 8 : 10;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.5L12 17.3 6.2 20.5l1.1-6.5L2.5 9.4l6.6-.9L12 2.5z" />
    </svg>
  );
}
