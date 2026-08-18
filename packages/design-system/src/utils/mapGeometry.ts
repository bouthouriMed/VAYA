export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface RouteGeometry {
  startPx: Point;
  endPx: Point;
  lengthPx: number;
  angleDeg: number;
}

/**
 * Resolves a route defined as fractions of a container (0..1, so it's
 * independent of the container's actual pixel size — the same fractional
 * route works whether the map is 300px or 600px tall) into pixel geometry:
 * a start/end point, the segment length, and its rotation angle. Returns
 * null until the container has been laid out (width/height are 0).
 */
export function computeRouteGeometry(
  containerSize: Size,
  startFraction: Point,
  endFraction: Point,
): RouteGeometry | null {
  if (containerSize.width === 0 || containerSize.height === 0) return null;

  const startPx = {
    x: startFraction.x * containerSize.width,
    y: startFraction.y * containerSize.height,
  };
  const endPx = { x: endFraction.x * containerSize.width, y: endFraction.y * containerSize.height };
  const dx = endPx.x - startPx.x;
  const dy = endPx.y - startPx.y;

  return {
    startPx,
    endPx,
    lengthPx: Math.hypot(dx, dy),
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/**
 * Evenly spaces `count` points along a route, leaving headroom at both ends
 * (t never reaches exactly 0 or 1) so markers don't sit on top of the
 * origin/destination markers. Works for any count, including 0 or 1.
 */
export function evenlySpacedPointsAlong(geometry: RouteGeometry, count: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    return {
      x: geometry.startPx.x + (geometry.endPx.x - geometry.startPx.x) * t,
      y: geometry.startPx.y + (geometry.endPx.y - geometry.startPx.y) * t,
    };
  });
}
