'use client';

import { useRef } from 'react';
import { useSectionProgress, range, easeOut } from './useSectionProgress';
import { StoreBadges } from '@/components/StoreBadges';

type Props = { title: string; body: string; appStore: string; googlePlay: string };

/** Closing bookend: the hero phone rises back into frame under the call to action. */
export function Finale({ title, body, appStore, googlePlay }: Props): React.JSX.Element {
  const section = useRef<HTMLElement>(null);
  const phone = useRef<HTMLImageElement>(null);
  const copy = useRef<HTMLDivElement>(null);

  useSectionProgress(section, (p) => {
    const t = easeOut(range(p, 0, 0.7));
    if (phone.current) phone.current.style.transform = `translate3d(-50%, ${(1 - t) * 30}%, 0) scale(${0.92 + t * 0.08})`;
    if (copy.current) {
      const c = easeOut(range(p, 0.1, 0.5));
      copy.current.style.opacity = String(c);
      copy.current.style.transform = `translate3d(0, ${(1 - c) * 30}px, 0)`;
    }
  });

  return (
    <section ref={section} id="final-cta" className="relative" style={{ height: '170vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 45% 45% at 50% 95%, rgba(63,190,133,0.28) 0%, transparent 70%), linear-gradient(180deg,#0D1512 0%,#08100C 100%)',
          }}
        />
        <div ref={copy} style={{ opacity: 0 }} className="relative z-10 mx-auto max-w-3xl px-6 pt-[16vh] text-center">
          <h2 className="balance bg-ink-gradient bg-clip-text font-display text-4xl leading-[1.04] tracking-tight text-transparent md:text-7xl">
            {title}
          </h2>
          <p className="balance mx-auto mt-5 max-w-md text-base text-ink-muted md:text-lg">{body}</p>
          <div className="mt-8 flex justify-center">
            <StoreBadges appStoreLabel={appStore} playLabel={googlePlay} className="!flex-row" />
          </div>
        </div>
        {/* last frame of the hero render — the same phone, closing the loop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={phone}
          src="/sequences/hero/0150.webp"
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute bottom-[-30vh] left-1/2 w-[135vh] max-w-none will-change-transform md:bottom-[-52vh] md:w-[190vh]"
          style={{ transform: 'translate3d(-50%, 30%, 0)' }}
        />
      </div>
    </section>
  );
}
