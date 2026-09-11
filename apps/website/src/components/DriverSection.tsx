import type { Dictionary } from '@/i18n/dictionaries';
import { DeviceFrame } from './DeviceFrame';

/**
 * Built directly against packages/design-system/src/primitives/
 * PriceRangeStepper.tsx and its real usage in apps/mobile/app/(tabs)/
 * publish.tsx's price step. A real, faithfully-preserved detail: this
 * primitive is one of the few in the app that still uses the legacy
 * static `colors` tokens (packages/design-system/src/tokens/colors.ts)
 * rather than the jewel-emerald `useAppTheme()` palette — not an
 * oversight to "fix" here, the exact real values.
 */
const legacy = {
  white: '#FFFFFF',
  gray300: '#DDD9CA',
  gray500: '#9B9788',
  gray600: '#7A8288',
  gray700: '#57616A',
  gray900: '#26333A',
  secondary: '#7FA491',
  trustBarFill: '#7FA491',
  trustBarTrack: '#E2E8E4',
};
const L = {
  background: '#FFFFFF',
  surfaceMuted: '#E4EDFB',
  ink: '#14201B',
  inkFaint: '#8B93A3',
  outlineVariant: '#E4EDFB',
};

const mockCopy = {
  fr: {
    stepTitle: 'Prix suggéré',
    eyebrow: 'PRIX SUGGÉRÉ',
    label: 'Contribution par place',
    suggested: 'Suggéré',
    hint: "Ce montant est calculé pour ce trajet — vous pouvez l'ajuster dans la marge proposée.",
    continue: 'Continuer',
  },
  en: {
    stepTitle: 'Suggested price',
    eyebrow: 'SUGGESTED PRICE',
    label: 'Contribution per seat',
    suggested: 'Suggested',
    hint: 'This amount is computed for this trip — you can adjust it within the proposed range.',
    continue: 'Continue',
  },
};

export function DriverSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  return (
    <section id="drivers" className="relative overflow-hidden bg-surface py-24 md:py-32">
      <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-16 px-6 md:grid-cols-2 md:px-10">
        <div className="flex justify-center">
          <DeviceFrame>
            <PricePickerMock locale={locale} />
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

const RECOMMENDED_RATIO = (12500 - 10200) / (14800 - 10200);

function PricePickerMock({ locale }: { locale: string }): React.JSX.Element {
  const t = locale === 'en' ? mockCopy.en : mockCopy.fr;
  return (
    <div className="flex h-full flex-col" style={{ background: L.background }}>
      {/* Real StepHeader: back chevron + centered step title */}
      <div
        className="flex items-center justify-between px-4 pb-3 pt-8"
        style={{ borderBottom: `1px solid ${L.outlineVariant}` }}
      >
        <ChevronIcon />
        <p className="text-[12px] font-semibold" style={{ color: L.ink }}>
          {t.stepTitle}
        </p>
        <span style={{ width: 14 }} />
      </div>

      <div className="flex flex-1 flex-col justify-center px-5 pb-10">
        <p
          className="text-[10px] font-semibold"
          style={{ color: L.inkFaint, letterSpacing: '1.2px' }}
        >
          {t.eyebrow}
        </p>

        {/* GlassSurface-wrapped PriceRangeStepper, legacy static tokens */}
        <div
          className="mt-3 rounded-2xl p-5"
          style={{ background: L.surfaceMuted + 'B0', border: `1px solid ${L.outlineVariant}` }}
        >
          <p className="text-center text-[11px] font-medium" style={{ color: legacy.gray700 }}>
            {t.label}
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: legacy.white, border: `1px solid ${legacy.gray300}` }}
            >
              <span className="text-lg" style={{ color: legacy.gray700 }}>
                −
              </span>
            </div>
            <div
              className="whitespace-nowrap rounded-xl px-4 py-2"
              style={{ background: legacy.white, border: `1px solid ${legacy.gray300}` }}
            >
              <p className="text-center text-base font-bold" style={{ color: legacy.gray900 }}>
                12,500 DT
              </p>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: legacy.white, border: `1px solid ${legacy.gray300}` }}
            >
              <span className="text-lg" style={{ color: legacy.gray700 }}>
                +
              </span>
            </div>
          </div>

          <div className="relative mt-5 h-2 rounded-full" style={{ background: legacy.trustBarTrack }}>
            <div
              className="absolute -top-1 h-3.5 w-0.5"
              style={{ background: legacy.gray500, left: `${RECOMMENDED_RATIO * 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: legacy.trustBarFill, width: '48%' }}
            />
            <div
              className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
              style={{ background: legacy.secondary, border: `2px solid ${legacy.white}`, left: 'calc(48% - 10px)' }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px]" style={{ color: legacy.gray500 }}>
              10,200 DT
            </span>
            <span className="text-[10px] font-medium" style={{ color: legacy.gray600 }}>
              {t.suggested} : 12,500 DT
            </span>
            <span className="text-[10px]" style={{ color: legacy.gray500 }}>
              14,800 DT
            </span>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-relaxed" style={{ color: L.inkFaint }}>
          {t.hint}
        </p>
      </div>

      <div className="px-5 pb-6 pt-2">
        <div className="rounded-xl py-3 text-center" style={{ background: '#14201B' }}>
          <span className="text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>
            {t.continue}
          </span>
        </div>
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
