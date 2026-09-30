'use client';

import { useRef } from 'react';
import { useSectionProgress, range, easeOut } from './useSectionProgress';

type Props = {
  id?: string;
  eyebrow: string;
  statement: string;
  items: { title: string; body: string }[];
};

/** A statement that lights up word by word as you scroll, then its supporting points. */
export function WordReveal({ id, eyebrow, statement, items }: Props): React.JSX.Element {
  const section = useRef<HTMLElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const list = statement.split(' ');

  useSectionProgress(section, (p) => {
    const reveal = range(p, 0.05, 0.55) * list.length;
    words.current.forEach((el, i) => {
      if (el) el.style.opacity = String(0.14 + 0.86 * Math.min(1, Math.max(0, reveal - i)));
    });
    cards.current.forEach((el, i) => {
      if (!el) return;
      const t = easeOut(range(p, 0.58 + i * 0.06, 0.72 + i * 0.06));
      el.style.opacity = String(t);
      el.style.transform = `translate3d(0, ${(1 - t) * 40}px, 0)`;
    });
  });

  return (
    <section ref={section} id={id} className="relative" style={{ height: '300vh' }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto w-full max-w-content px-6">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
          <p className="max-w-5xl font-display text-3xl leading-[1.12] tracking-tight text-ink md:text-6xl">
            {list.map((w, i) => (
              <span
                key={i}
                ref={(el) => {
                  words.current[i] = el;
                }}
                style={{ opacity: 0.14 }}
              >
                {w}{' '}
              </span>
            ))}
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3 md:mt-16 md:grid-cols-4 md:gap-5">
            {items.map((it, i) => (
              <div
                key={i}
                ref={(el) => {
                  cards.current[i] = el;
                }}
                style={{ opacity: 0 }}
                className="rounded-3xl border border-outline/70 bg-surface/70 p-4 backdrop-blur md:p-6"
              >
                <p className="font-display text-sm text-accent md:text-base">0{i + 1}</p>
                <h3 className="mt-2 font-display text-base leading-snug text-ink md:text-xl">{it.title}</h3>
                <p className="mt-2 hidden text-sm leading-relaxed text-ink-muted md:block">{it.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
