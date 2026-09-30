'use client';

import { useEffect, useRef } from 'react';
import { useSectionProgress, range, easeInOut, easeOut } from './useSectionProgress';

type Step = { label: string; title: string; body: string };

type Props = {
  eyebrow: string;
  title: string;
  steps: [Step, Step, Step];
  pinLabel: string;
  imageAlt: string;
};

// Route geometry in the photo's own pixel space (1916×821).
const ROUTE = 'M 800 840 C 640 740, 452 668, 478 600 S 516 546, 540 534';
const ONWARD = 'M 540 534 C 590 516, 650 508, 720 506 S 820 508, 860 522';
const PIN = { x: 540, y: 534 };

/**
 * Scene 2 — the Tunisian coast at golden hour. Scrolling pushes into the
 * road while a VAYA route draws along it and stops at a pickup point.
 */
export function CoastRide({ eyebrow, title, steps, pinLabel, imageAlt }: Props): React.JSX.Element {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const route = useRef<SVGPathElement>(null);
  const routeGlow = useRef<SVGPathElement>(null);
  const onward = useRef<SVGPathElement>(null);
  const head = useRef<SVGGElement>(null);
  const pin = useRef<SVGGElement>(null);
  const ripple = useRef<SVGCircleElement>(null);
  const beats = useRef<(HTMLDivElement | null)[]>([]);
  const svg = useRef<SVGSVGElement>(null);

  // Portrait screens: crop the photo around the road bend instead of its center.
  useEffect(() => {
    const fit = (): void => {
      const el = svg.current;
      if (!el) return;
      const aspect = window.innerWidth / window.innerHeight;
      const w = Math.min(1916, 821 * aspect);
      const x = Math.min(1916 - w, Math.max(0, 590 - w / 2));
      el.setAttribute('viewBox', aspect >= 1916 / 821 ? '0 0 1916 821' : `${x} 0 ${w} 821`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const windows: [number, number][] = [
    [0.04, 0.26],
    [0.3, 0.52],
    [0.56, 0.76],
    [0.8, 1.01],
  ];

  useSectionProgress(section, (p) => {
    const push = easeInOut(range(p, 0.02, 0.95));
    if (stage.current) {
      stage.current.style.transform = `scale(${1.02 + push * 0.2}) translate3d(${push * 2}%, ${-push * 1.5}%, 0)`;
    }
    if (shade.current) shade.current.style.opacity = String(0.92 - 0.72 * easeOut(range(p, 0, 0.14)));

    const draw = easeInOut(range(p, 0.26, 0.58));
    const r = route.current;
    if (r) {
      const len = r.getTotalLength();
      const off = String(len * (1 - draw));
      r.style.strokeDasharray = `${len}`;
      r.style.strokeDashoffset = off;
      if (routeGlow.current) {
        routeGlow.current.style.strokeDasharray = `${len}`;
        routeGlow.current.style.strokeDashoffset = off;
      }
      if (head.current) {
        const pt = r.getPointAtLength(len * draw);
        head.current.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
        head.current.style.opacity = String(range(p, 0.24, 0.28) * (1 - range(p, 0.6, 0.64)));
      }
    }
    if (onward.current) onward.current.style.opacity = String(0.85 * range(p, 0.66, 0.8));
    const drop = easeOut(range(p, 0.56, 0.64));
    if (pin.current) {
      pin.current.style.opacity = String(drop);
      pin.current.setAttribute('transform', `translate(${PIN.x} ${PIN.y - (1 - drop) * 40})`);
    }
    if (ripple.current) {
      const t = range(p, 0.6, 0.74);
      ripple.current.setAttribute('r', String(10 + t * 60));
      ripple.current.style.opacity = String(t > 0 && t < 1 ? 0.7 * (1 - t) : 0);
    }

    windows.forEach(([a, b], i) => {
      const el = beats.current[i];
      if (!el) return;
      const ramp = 0.05;
      const v = Math.min(range(p, a, a + ramp), i === windows.length - 1 ? 1 : 1 - range(p, b - ramp, b));
      el.style.opacity = String(v);
      el.style.transform = `translate3d(0, ${(1 - v) * 26}px, 0)`;
      el.style.filter = v < 1 ? `blur(${(1 - v) * 6}px)` : 'none';
      el.style.visibility = v <= 0.001 ? 'hidden' : 'visible';
    });
  });

  const stepBeat = (s: Step, i: number): React.JSX.Element => (
    <div
      key={i}
      ref={(el) => {
        beats.current[i + 1] = el;
      }}
      style={{ opacity: 0 }}
      className="absolute bottom-[10vh] left-0 max-w-xl px-6 will-change-transform md:bottom-[14vh] md:left-[7vw]"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.26em] text-[#7FF0BA] [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
        0{i + 1} — {s.label}
      </p>
      <h3 className="balance font-display text-3xl leading-[1.08] text-ink md:text-5xl">{s.title}</h3>
      <p className="mt-4 max-w-md text-base leading-relaxed text-ink/85 md:text-lg [text-shadow:0_1px_16px_rgba(0,0,0,0.5)]">{s.body}</p>
    </div>
  );

  return (
    <section ref={section} id="journey" className="relative" style={{ height: '420vh' }}>
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-background">
        <div ref={stage} className="absolute inset-0 will-change-transform" style={{ transformOrigin: '45% 64%' }}>
          <svg
            viewBox="0 0 1916 821"
            ref={svg}
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={imageAlt}
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="9" />
              </filter>
            </defs>
            <image href="/images/coast.webp" width="1916" height="821" preserveAspectRatio="xMidYMid slice" />
            <path ref={onward} d={ONWARD} fill="none" stroke="#F6F1E7" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 14" style={{ opacity: 0 }} />
            <path ref={routeGlow} d={ROUTE} fill="none" stroke="#3FBE85" strokeWidth="22" strokeLinecap="round" filter="url(#glow)" opacity="0.8" />
            <path ref={route} d={ROUTE} fill="none" stroke="#63E8A9" strokeWidth="8" strokeLinecap="round" />
            <g ref={head} style={{ opacity: 0 }}>
              <circle r="22" fill="#3FBE85" opacity="0.35" filter="url(#glow)" />
              <circle r="9" fill="#F6F1E7" />
            </g>
            <circle ref={ripple} cx={PIN.x} cy={PIN.y} r="10" fill="none" stroke="#63E8A9" strokeWidth="3" style={{ opacity: 0 }} />
            <g ref={pin} style={{ opacity: 0 }}>
              <path d="M0 0 C -4 -10, -18 -20, -18 -34 A 18 18 0 1 1 18 -34 C 18 -20, 4 -10, 0 0 Z" fill="#0D1512" stroke="#63E8A9" strokeWidth="3" />
              <circle cy="-34" r="7" fill="#63E8A9" />
              <g transform="translate(-118 -118)">
                <rect width="236" height="44" rx="22" fill="rgba(13,21,18,0.82)" stroke="rgba(99,232,169,0.5)" />
                <text x="20" y="28" fill="#F6F1E7" fontSize="17" fontFamily="var(--font-jakarta), sans-serif" fontWeight="600">
                  {pinLabel}
                </text>
              </g>
            </g>
          </svg>
        </div>

        {/* grade: legibility + blend into the dark page above/below */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,21,18,0.55)_0%,transparent_28%,transparent_52%,rgba(13,21,18,0.88)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_45%,transparent_55%,rgba(8,16,12,0.7)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_12%_85%,rgba(8,16,12,0.65)_0%,transparent_100%)]" />
        <div ref={shade} aria-hidden className="pointer-events-none absolute inset-0 bg-background" />

        <div
          ref={(el) => {
            beats.current[0] = el;
          }}
          style={{ opacity: 0 }}
          className="absolute inset-x-0 top-[13vh] px-6 text-center will-change-transform"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-[#7FF0BA] [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{eyebrow}</p>
          <h2 className="balance mx-auto max-w-4xl font-display text-5xl font-medium leading-[1.02] tracking-tight text-ink drop-shadow-[0_2px_30px_rgba(0,0,0,0.45)] md:text-7xl">
            {title}
          </h2>
        </div>
        {steps.map(stepBeat)}
      </div>
    </section>
  );
}
