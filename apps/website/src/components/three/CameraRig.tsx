'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { roadCurve, clamp01, smoothstep, lerp, cameraShots, CHAPTER_COUNT } from '@/lib/curve';

const tmpTarget = new Vector3();
const tmpLook = new Vector3();
const tmpUp = new Vector3(0, 1, 0);
const tmpLateral = new Vector3();

export function CameraRig({ progressRef }: { progressRef: React.MutableRefObject<number> }): null {
  const { camera } = useThree();
  const smoothed = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const pointerSmoothed = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame(() => {
    smoothed.current += (progressRef.current - smoothed.current) * 0.085;
    const p = clamp01(smoothed.current);

    pointerSmoothed.current.x += (pointer.current.x - pointerSmoothed.current.x) * 0.04;
    pointerSmoothed.current.y += (pointer.current.y - pointerSmoothed.current.y) * 0.04;

    // Which pair of camera "shots" we're between, and how far along.
    const scaled = p * CHAPTER_COUNT;
    const chapterIndex = Math.min(CHAPTER_COUNT - 1, Math.floor(scaled));
    const localT = smoothstep(0, 1, scaled - chapterIndex);
    const shotA = cameraShots[chapterIndex]!;
    const shotB = cameraShots[Math.min(cameraShots.length - 1, chapterIndex + 1)]!;

    const isArrival = p > 0.94;
    const arrivalT = smoothstep(0.94, 1, p);
    const height = lerp(shotA.height, shotB.height, localT) + (isArrival ? arrivalT * 5 : 0);
    const back = lerp(shotA.back, shotB.back, localT) + (isArrival ? arrivalT * 7 : 0);
    const lateral = lerp(shotA.lateral, shotB.lateral, localT);
    const fov = lerp(shotA.fov, shotB.fov, localT);

    const camT = clamp01(p - 0.055);
    const lookT = clamp01(p + 0.045);

    const point = roadCurve.getPointAt(camT);
    const tangent = roadCurve.getTangentAt(camT).normalize();
    tmpLateral.set(-tangent.z, 0, tangent.x); // perpendicular to travel direction

    tmpTarget.copy(point).addScaledVector(tangent, -back).addScaledVector(tmpLateral, lateral);
    tmpTarget.y += height;
    // Subtle steadicam parallax from pointer position — organic, not locked to a rail.
    tmpTarget.addScaledVector(tmpLateral, pointerSmoothed.current.x * 0.5);
    tmpTarget.y += pointerSmoothed.current.y * -0.25;

    camera.position.copy(tmpTarget);
    camera.up.copy(tmpUp);

    tmpLook.copy(roadCurve.getPointAt(lookT));
    tmpLook.y += 0.6;
    camera.lookAt(tmpLook);

    const cam = camera as ThreePerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov += (fov - cam.fov) * 0.06;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
