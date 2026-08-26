import React from 'react';
import { Polyline } from 'react-native-maps';
import type { LatLng } from 'react-native-maps';
import { colors } from '../tokens/index';

interface MapRouteProps {
  /** Real route geometry — decode an OSRM/Google polyline string upstream
   *  (apps/mobile/src/utils/polyline.ts's decodePolyline already returns
   *  this exact shape) and pass the points in. Must be rendered as a child
   *  of MapCanvas's MapView, matching react-native-maps' own constraint. */
  coordinates: LatLng[];
  color?: string;
  width?: number;
  /** Renders a soft, wide underlay beneath the route line — a cheap visual
   *  approximation of the route-overlap corridor concept from
   *  apps/api/src/lib/polyline.ts's computeRouteOverlapFraction, not precise
   *  offset-polygon geometry (that's real geometric work belonging to
   *  whichever ride-engine phase actually needs an exact corridor shape). */
  showCorridor?: boolean;
}

/** Draws real route geometry as a MapView Polyline (and optional corridor glow).
 *
 *  The corridor Polyline is ALWAYS rendered when `coordinates` is non-empty
 *  — never conditionally mounted/unmounted based on `showCorridor` — and its
 *  visibility is toggled via a transparent stroke color instead. A caller
 *  that flips `showCorridor` on an already-mounted route (e.g. toggling
 *  which of several route alternatives is selected) must never change the
 *  number of overlay children a single MapView renders in one pass: on iOS,
 *  react-native-maps' native overlay reconciliation can crash the whole app
 *  when a MapView's child overlay count changes between renders (the same
 *  crash class documented on DateCalendarSheet's month-swipe gesture) — this
 *  was a real, reproduced "selecting another route in the publish wizard
 *  crashes and dismisses the app" bug on iOS. Keeping the node count fixed
 *  and only ever changing existing overlays' props (color/width) avoids it. */
export function MapRoute({
  coordinates,
  color = colors.mapRouteLine,
  width = 4,
  showCorridor = false,
}: MapRouteProps): React.JSX.Element {
  return (
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor={showCorridor ? colors.mapCorridorFill : 'transparent'}
        strokeWidth={width * 6}
        lineCap="round"
      />
      <Polyline coordinates={coordinates} strokeColor={color} strokeWidth={width} lineCap="round" />
    </>
  );
}
