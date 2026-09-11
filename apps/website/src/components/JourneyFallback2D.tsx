'use client';

import { useEffect, useRef } from 'react';
import { beats, smoothstep, clamp01 } from '@/lib/curve';

const PATH_D =
  'M 90 780 C 220 680 40 560 160 470 C 300 370 70 300 150 210 C 230 120 130 70 200 20';

const pinDefs = [
  { t: beats.origin.t, showFrom: beats.origin.showFrom, showTo: beats.origin.showTo, color: '#DDE6DE' },
  ...beats.candidates.map((c) => ({
    t: c.t,
    showFrom: c.showFrom,
    showTo: c.showTo,
    color: c.selected ? '#3FBE85' : '#7FA491',
  })),
  {
    t: beats.destination.t,
    showFrom: beats.destination.showFrom,
    showTo: beats.destination.showTo,
    color: '#DDE6DE',
  },
];

/**
 * Lightweight 2D fallback for mobile / reduced-motion / no-WebGL: the same
 * story beats (origin, candidate stops, driver car, destination) traced
 * along a single winding SVG path instead of a full 3D scene. Reads the
 * same `progressRef` the 3D scene would, via a plain rAF loop — no GSAP,
 * no WebGL, negligible battery cost.
 */
export function JourneyFallback2D({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}): React.JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const riderRef = useRef<SVGCircleElement>(null);
  const pinRefs = useRef<(SVGGElement | null)[]>([]);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();

    function tick(): void {
      const p = progressRef.current;
      const path = pathRef.current;
      if (!path) return;

      const carVisible = smoothstep(beats.carAppearAt - 0.03, beats.carAppearAt + 0.03, p);
      const pt = path.getPointAtLength(clamp01(p + 0.03) * total);
      if (carRef.current) {
        carRef.current.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
        carRef.current.style.opacity = String(carVisible);
      }
      if (riderRef.current) {
        const riderVisible = smoothstep(beats.carPickupAt, beats.carPickupAt + 0.04, p);
        riderRef.current.style.opacity = String(riderVisible);
      }

      pinRefs.current.forEach((el, i) => {
        if (!el) return;
        const def = pinDefs[i];
        if (!def) return;
        const fadeIn = smoothstep(def.showFrom, def.showFrom + 0.03, p);
        const fadeOut = def.showTo >= 1 ? 1 : 1 - smoothstep(def.showTo - 0.03, def.showTo, p);
        el.style.opacity = String(Math.min(fadeIn, fadeOut));
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [progressRef]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-vaya-gradient">
      <svg viewBox="0 0 400 800" className="h-full w-auto max-w-full" aria-hidden="true">
        <path
          ref={pathRef}
          d={PATH_D}
          fill="none"
          stroke="#20302A"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={PATH_D}
          fill="none"
          stroke="#7FA491"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.75}
        />
        {pinDefs.map((def, i) => {
          return (
            <PinMarker
              key={i}
              pathD={PATH_D}
              t={def.t}
              color={def.color}
              refCb={(el) => {
                pinRefs.current[i] = el;
              }}
            />
          );
        })}
        <g ref={carRef} style={{ opacity: 0 }}>
          <circle r={11} fill="#F6F1E7" />
          <circle r={6} fill="#0D1512" />
          <circle ref={riderRef} cx={0} cy={-16} r={4} fill="#3FBE85" style={{ opacity: 0 }} />
        </g>
      </svg>
    </div>
  );
}

function PinMarker({
  pathD,
  t,
  color,
  refCb,
}: {
  pathD: string;
  t: number;
  color: string;
  refCb: (el: SVGGElement | null) => void;
}): React.JSX.Element {
  const localPathRef = useRef<SVGPathElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svgPath.setAttribute('d', pathD);
    localPathRef.current = svgPath;
    const total = svgPath.getTotalLength();
    const pt = svgPath.getPointAtLength(t * total);
    if (gRef.current) {
      gRef.current.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
    }
  }, [pathD, t]);

  return (
    <g
      ref={(el) => {
        gRef.current = el;
        refCb(el);
      }}
      style={{ opacity: 0 }}
    >
      <circle r={7} fill={color} stroke="#0D1512" strokeWidth={1.5} />
      <circle r={11} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
    </g>
  );
}
