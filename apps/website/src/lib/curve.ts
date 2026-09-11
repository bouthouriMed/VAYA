import { CatmullRomCurve3, Vector3 } from 'three';

/**
 * The single road path everything in the 3D journey shares: the camera
 * rig, the road/route-line meshes, the car, and every pin. One curve, one
 * source of truth, so the car always sits on the road and the camera
 * always looks the direction the road actually bends.
 */
export const roadCurve = new CatmullRomCurve3(
  [
    new Vector3(0, 0, 0),
    new Vector3(2.2, 0, -20),
    new Vector3(-3.2, 0, -46),
    new Vector3(4.2, 0, -72),
    new Vector3(-2.4, 0, -98),
    new Vector3(3.0, 0, -124),
    new Vector3(0, 0, -150),
  ],
  false,
  'catmullrom',
  0.4
);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Story beats — each pin/actor's position along the road (0..1) and the
 *  scroll-progress window it should be visible for. Kept in one place so
 *  the 3D scene and the DOM step copy stay in sync by construction. */
export const beats = {
  origin: { t: 0.03, showFrom: 0.0, showTo: 1.0 },
  candidates: [
    { t: 0.21, showFrom: 0.14, showTo: 0.34, selected: false },
    { t: 0.245, showFrom: 0.14, showTo: 1.0, selected: true },
    { t: 0.28, showFrom: 0.14, showTo: 0.34, selected: false },
  ],
  destination: { t: 0.97, showFrom: 0.8, showTo: 1.0 },
  carAppearAt: 0.46,
  carPickupAt: 0.62,
  carEnd: 0.97,
} as const;
