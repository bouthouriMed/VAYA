import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../tokens/index';
import type { RouteGeometry } from '../utils/mapGeometry';

interface MapRouteProps {
  geometry: RouteGeometry;
  roadWidth?: number;
  color?: string;
  showArrow?: boolean;
}

/** Draws a rounded route corridor between two points, plus a direction arrow at the end. */
export function MapRoute({
  geometry,
  roadWidth = 34,
  color = colors.mapRouteLine + 'A0',
  showArrow = true,
}: MapRouteProps): React.JSX.Element {
  return (
    <>
      <View
        style={[
          styles.road,
          {
            width: geometry.lengthPx,
            height: roadWidth,
            borderRadius: roadWidth / 2,
            left: geometry.startPx.x,
            top: geometry.startPx.y - roadWidth / 2,
            backgroundColor: color,
            transform: [{ rotate: `${geometry.angleDeg}deg` }],
            transformOrigin: 'left center',
          },
        ]}
      />
      {showArrow ? (
        <View
          style={[
            styles.arrow,
            {
              left: geometry.endPx.x - 8,
              top: geometry.endPx.y - 6,
              transform: [{ rotate: `${geometry.angleDeg + 90}deg` }],
            },
          ]}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  road: {
    position: 'absolute',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.primary,
  },
});
