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

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The page is one continuous 7-chapter scroll: chapter 0 is the hero (an
 * establishing shot on the same canvas everything else lives on, not a
 * separate flat section), chapters 1-6 are the story beats. `CHAPTER_COUNT`
 * and `bodyStart` are the single source both the DOM chapter panels and the
 * 3D beat timing below key off, so nothing can drift out of sync.
 */
export const CHAPTER_COUNT = 7;
const bodyStart = 1 / CHAPTER_COUNT;
const toBodyProgress = (old: number): number => bodyStart + old * (1 - bodyStart);

/** Story beats — each pin/actor's position along the road (0..1) and the
 *  scroll-progress window it should be visible for. Kept in one place so
 *  the 3D scene and the DOM chapter copy stay in sync by construction. */
export const beats = {
  origin: { t: 0.03, showFrom: 0, showTo: 1 },
  candidates: [
    { t: 0.21, showFrom: toBodyProgress(0.14), showTo: toBodyProgress(0.34), selected: false },
    { t: 0.245, showFrom: toBodyProgress(0.14), showTo: 1, selected: true },
    { t: 0.28, showFrom: toBodyProgress(0.14), showTo: toBodyProgress(0.34), selected: false },
  ],
  destination: { t: 0.97, showFrom: toBodyProgress(0.8), showTo: 1 },
  carAppearAt: toBodyProgress(0.46),
  carPickupAt: toBodyProgress(0.62),
  carEnd: toBodyProgress(0.97),
} as const;

/**
 * Distinct camera "shots" anchored at each chapter boundary (8 points for
 * 7 chapters) instead of one continuous formula — an epic low establishing
 * angle on the hero, a wide overview for the price beat, a tight chase for
 * the request/accept beats, a dramatic pull-back for arrival. Smoothly
 * interpolated between neighbours (never a hard cut) so it still reads as
 * one unbroken camera move that changes its language over time, the way a
 * real cinematographer would cut a single tracking shot's lens/height
 * rather than holding one static formula for six minutes of footage.
 */
export interface CameraShot {
  height: number;
  back: number;
  fov: number;
  lateral: number;
}

export const cameraShots: CameraShot[] = [
  { height: 0.95, back: 1.7, fov: 36, lateral: 0 }, // 0 hero — close, low, dramatic
  { height: 2.7, back: 4.6, fov: 45, lateral: 0.6 }, // 1 search — pull back, reveal road
  { height: 1.7, back: 3.0, fov: 41, lateral: -0.5 }, // 2 pick stop — intimate, near pins
  { height: 3.4, back: 5.8, fov: 48, lateral: 0.4 }, // 3 price — elevated overview
  { height: 1.5, back: 2.6, fov: 39, lateral: -0.4 }, // 4 request — tight chase
  { height: 1.95, back: 2.9, fov: 37, lateral: 0.3 }, // 5 accepted — close, warm
  { height: 2.5, back: 3.8, fov: 42, lateral: -0.3 }, // 6 empty seat filled
  { height: 10.5, back: 15, fov: 52, lateral: 0 }, // 7 arrival — dramatic reveal
];
