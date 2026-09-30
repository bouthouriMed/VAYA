import { preload } from 'react-dom';
import type { Dictionary } from '@/i18n/dictionaries';
import { ScrollSequence } from './ScrollSequence';
import { StoreBadges } from '@/components/StoreBadges';

/** Scene 1 — the phone turns out of the dark and the app lights up. */
export function HeroPhone({ dict }: { dict: Dictionary }): React.JSX.Element {
  const h = dict.hero;
  preload('/sequences/hero/0001.webp', { as: 'image', fetchPriority: 'high' });
  return (
    <ScrollSequence
      id="top"
      name="hero"
      frames={150}
      lengthVh={420}
      canvasTransform="translate3d(0, calc(max(0, 0.26 - var(--p, 0)) * 125vh), 0)"
      backdrop={
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 42% 55% at 50% 52%, rgba(63,190,133, calc(0.05 + var(--p, 0) * 0.16)) 0%, transparent 70%), radial-gradient(ellipse 90% 70% at 50% 40%, #16211C 0%, #0D1512 60%, #08100C 100%)',
          }}
        />
      }
      beats={[
        {
          from: 0,
          to: 0.2,
          holdStart: true,
          position: 'top',
          children: (
            <div className="max-w-4xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-accent">{h.eyebrow}</p>
              <h1 className="balance bg-ink-gradient bg-clip-text font-display text-5xl font-medium leading-[1.02] tracking-tight text-transparent md:text-7xl lg:text-8xl">
                {h.headline}
              </h1>
            </div>
          ),
        },
        {
          from: 0.3,
          to: 0.58,
          position: 'left',
          children: (
            <p className="balance max-w-sm font-display text-2xl leading-tight text-ink md:text-5xl">
              {dict.cinema.heroBeat1}
            </p>
          ),
        },
        {
          from: 0.5,
          to: 0.78,
          position: 'right',
          children: (
            <p className="balance max-w-sm font-display text-2xl leading-tight text-ink md:text-5xl">
              {dict.cinema.heroBeat2}
            </p>
          ),
        },
        {
          from: 0.84,
          to: 1,
          holdEnd: true,
          position: 'left',
          children: (
            <div className="max-w-md">
              <p className="balance font-display text-2xl leading-tight text-ink md:text-5xl">{h.subhead}</p>
              <div className="mt-5 md:mt-8">
                <StoreBadges
                  className="!flex-row [&>a]:flex-1 [&>a]:px-3 md:[&>a]:flex-none md:[&>a]:px-5"
                  appStoreLabel={dict.finalCta.appStore}
                  playLabel={dict.finalCta.googlePlay}
                />
              </div>
              <p className="mt-3 hidden text-sm text-ink-faint md:block">{h.storeNote}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
