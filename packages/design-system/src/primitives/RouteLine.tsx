import React from 'react';
import { Polyline, type LatLng } from 'react-native-maps';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

/** One stretch of the route; `emphasis` is how many passengers ride it
 *  (0 = the driver alone). Heavier and darker as it rises. */
export interface RouteLineSegment {
  coordinates: LatLng[];
  emphasis?: number;
}

type RouteLineSize = 'compact' | 'full';

const WIDTHS: Record<RouteLineSize, { core: number; casing: number; step: number }> = {
  compact: { core: 4, casing: 7, step: 1 },
  full: { core: 6, casing: 11, step: 1 },
};

/**
 * The one way a route is drawn on any VAYA map: a light casing under a
 * solid accent core — how navigation apps keep a route legible over any
 * terrain, light or dark. Before this, each map drew its own thin line
 * (ink on a dark map, dashed outline-grey on an empty ride) and routes
 * disappeared into the tiles. Must be rendered inside a MapView.
 *
 * For showing a ride's route. MapRoute stays the publish wizard's
 * route-alternatives line (with its corridor glow). Same iOS constraint as
 * MapRoute's doc comment: the casing is always mounted, and the number of
 * core segments only changes when the segment data itself does.
 */
export function RouteLine({
  coordinates,
  segments,
  size = 'compact',
  dashed = false,
  theme: themeOverride,
}: {
  /** The whole route. Used for the casing, and as the single core segment
   *  when `segments` is omitted. */
  coordinates: LatLng[];
  /** Optional per-stretch emphasis (e.g. seats occupied on each leg). */
  segments?: RouteLineSegment[];
  size?: RouteLineSize;
  /** For approximate geometry (no real road route available). */
  dashed?: boolean;
  theme?: AppPalette;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  if (coordinates.length < 2) return null;

  const widths = WIDTHS[size];
  const cores: RouteLineSegment[] =
    segments && segments.length > 0 ? segments : [{ coordinates, emphasis: 0 }];
  const dash = dashed ? [widths.core * 2, widths.core + 2] : undefined;

  return (
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor={theme.surface}
        strokeWidth={widths.casing}
        lineCap="round"
        lineJoin="round"
        zIndex={1}
      />
      {cores.map((segment, i) =>
        segment.coordinates.length > 1 ? (
          <Polyline
            key={i}
            coordinates={segment.coordinates}
            strokeColor={(segment.emphasis ?? 0) >= 1 ? theme.accentStrong : theme.accent}
            strokeWidth={widths.core + Math.min(segment.emphasis ?? 0, 2) * widths.step}
            lineDashPattern={dash}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        ) : null,
      )}
    </>
  );
}
