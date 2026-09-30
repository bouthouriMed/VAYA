'use client';

import { useRef } from 'react';
import clsx from 'clsx';
import { useSectionProgress, range, easeInOut } from './useSectionProgress';

export type StoryStep = { title: string; body: string; screen: string; alt: string };

type Props = {
  id?: string;
  eyebrow: string;
  title: string;
  steps: StoryStep[];
  /** which side the phone sits on at desktop widths */
  phoneSide?: 'left' | 'right';
};

// Measured from the rendered frame (blender/scene_phone_frame.py).
const SCREEN = { left: '6.84%', top: '4.22%', width: '86.25%', height: '91.56%', radius: '12.98% / 6.03%' };

/**
 * A pinned, Blender-rendered phone whose screen advances through real app
 * screenshots as you scroll, with the matching step highlighted beside it.
 */
export function PhoneStory({ id, eyebrow, title, steps, phoneSide = 'right' }: Props): React.JSX.Element {
  const section = useRef<HTMLElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const screens = useRef<(HTMLDivElement | null)[]>([]);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const n = steps.length;

  useSectionProgress(section, (p) => {
    // continuous screen position with plateaus: hold, then a quick eased swap
    const raw = p * n;
    const k = Math.min(n - 1, Math.floor(raw));
    const local = raw - k;
    const pos = k < n - 1 ? k + easeInOut(range(local, 0.72, 1)) : k;

    screens.current.forEach((el, i) => {
      if (!el) return;
      const d = i - pos; // >0 below, <0 above/behind
      if (d >= 0) {
        el.style.transform = `translate3d(0, ${Math.min(d, 1) * 102}%, 0)`;
        el.style.filter = 'none';
      } else {
        const t = Math.min(-d, 1);
        el.style.transform = `translate3d(0, ${-t * 18}%, 0) scale(${1 - t * 0.06})`;
        el.style.filter = `brightness(${1 - t * 0.55})`;
      }
      el.style.visibility = d > 1.001 || d < -1.001 ? 'hidden' : 'visible';
    });
    items.current.forEach((el, i) => {
      if (!el) return;
      const active = 1 - Math.min(1, Math.abs(i - pos));
      el.style.setProperty('--a', active.toFixed(3));
      el.style.transform = `translate3d(${active * 10}px, 0, 0)`;
    });
    if (rail.current) rail.current.style.transform = `scaleY(${(pos + 1) / n})`;
    if (phone.current) {
      const enter = easeInOut(range(p, 0, 0.12));
      const tilt = (p - 0.5) * (phoneSide === 'right' ? -10 : 10);
      phone.current.style.transform = `perspective(1600px) translate3d(0, ${(1 - enter) * 12}vh, 0) rotateY(${tilt}deg) rotateX(${(1 - enter) * 8}deg)`;
      phone.current.style.opacity = String(0.2 + 0.8 * enter);
    }
  });

  return (
    <section ref={section} id={id} className="relative" style={{ height: `${(n + 0.6) * 100}vh` }}>
      <div className="sticky top-0 flex h-[100svh] w-full items-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 38% 55% at ${phoneSide === 'right' ? '70%' : '30%'} 55%, rgba(63,190,133,0.16) 0%, transparent 70%)`,
          }}
        />
        <div
          className={clsx(
            'relative mx-auto flex w-full max-w-content flex-col items-center gap-6 px-6 md:gap-16',
            phoneSide === 'right' ? 'md:flex-row' : 'md:flex-row-reverse',
          )}
        >
          <div className="order-2 w-full md:order-none md:flex-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
            <h2 className="balance mb-8 hidden font-display text-4xl leading-[1.05] tracking-tight text-ink md:block lg:text-6xl">
              {title}
            </h2>
            <div className="relative pl-6">
              <div className="absolute left-0 top-1 h-[calc(100%-8px)] w-px bg-outline" />
              <div ref={rail} className="absolute left-0 top-1 h-[calc(100%-8px)] w-px origin-top bg-accent" />
              <ol className="relative min-h-[8.5rem] md:grid md:min-h-0 md:gap-7">
                {steps.map((s, i) => (
                  <li
                    key={i}
                    ref={(el) => {
                      items.current[i] = el;
                    }}
                    className="opacity-[var(--a)] will-change-transform max-md:absolute max-md:inset-x-0 max-md:top-0 md:opacity-[calc(0.28+var(--a)*0.72)]"
                    style={{ ['--a' as string]: i === 0 ? 1 : 0 }}
                  >
                    <h3 className="font-display text-xl text-ink md:text-2xl">{s.title}</h3>
                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted md:text-base">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="relative order-1 flex justify-center md:order-none md:flex-1">
            <div
              ref={phone}
              className="relative w-[46vw] max-w-[330px] will-change-transform md:w-[24vw] md:max-w-[360px]"
              style={{ aspectRatio: '1520 / 3080' }}
            >
              <div
                className="absolute overflow-hidden bg-black"
                style={{ left: SCREEN.left, top: SCREEN.top, width: SCREEN.width, height: SCREEN.height, borderRadius: SCREEN.radius }}
              >
                {steps.map((s, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      screens.current[i] = el;
                    }}
                    className="absolute inset-0 origin-top will-change-transform"
                    style={{ transform: `translate3d(0, ${i === 0 ? 0 : 102}%, 0)` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.screen} alt={s.alt} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/phone-frame.webp" alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
