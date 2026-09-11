/**
 * Web recreation of @vaya/design-system's RoutePulseBadge primitive —
 * concentric rings radiating from a solid core, VAYA's actual driver-flow
 * signature motif in the app (driver onboarding hero, sign-in hero). Same
 * geometry/proportions, redrawn in SVG since the RN component can't be
 * imported into a web bundle; the pulse-ring animation is new to this
 * context (the app's own primitive is static) — appropriate for a hero
 * that has more room to breathe than a mobile screen.
 */
export function RoutePulseBadge({
  size = 128,
  className = '',
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  const core = size * 0.625;
  const center = size / 2;
  const ringRadii = [center - 2, center * 0.78, center * 0.62];

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 -m-4 animate-pulse-ring rounded-full border border-accent/50" />
      <svg width={size} height={size} className="absolute inset-0">
        {ringRadii.map((r, i) => (
          <circle
            key={r}
            cx={center}
            cy={center}
            r={r}
            stroke="#A8C4B6"
            strokeWidth={1.5}
            strokeOpacity={0.35 - i * 0.1}
            fill="none"
          />
        ))}
      </svg>
      <div
        className="absolute rounded-full bg-accent shadow-[0_0_40px_rgba(63,190,133,0.55)]"
        style={{
          width: core,
          height: core,
          left: (size - core) / 2,
          top: (size - core) / 2,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          width={core * 0.42}
          height={core * 0.42}
          fill="none"
          stroke="#0D1512"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      </div>
    </div>
  );
}
