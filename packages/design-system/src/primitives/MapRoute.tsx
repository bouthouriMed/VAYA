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

/** Draws real route geometry as a MapView Polyline (and optional corridor glow). */
export function MapRoute({
  coordinates,
  color = colors.mapRouteLine,
  width = 4,
  showCorridor = false,
}: MapRouteProps): React.JSX.Element {
  return (
    <>
      {showCorridor ? (
        <Polyline
          coordinates={coordinates}
          strokeColor={colors.mapCorridorFill}
          strokeWidth={width * 6}
          lineCap="round"
        />
      ) : null}
      <Polyline coordinates={coordinates} strokeColor={color} strokeWidth={width} lineCap="round" />
    </>
  );
}
