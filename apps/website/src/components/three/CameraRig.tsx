'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { roadCurve, clamp01 } from '@/lib/curve';

const tmpTarget = new Vector3();
const tmpLook = new Vector3();
const tmpUp = new Vector3(0, 1, 0);

export function CameraRig({ progressRef }: { progressRef: React.MutableRefObject<number> }): null {
  const { camera } = useThree();
  const smoothed = useRef(0);

  useFrame(() => {
    smoothed.current += (progressRef.current - smoothed.current) * 0.09;
    const p = clamp01(smoothed.current);

    // Trail slightly behind the story beat, pull back wide for the arrival reveal.
    const camT = clamp01(p - 0.06);
    const lookT = clamp01(p + 0.05);
    const isArrival = p > 0.9;
    const height = isArrival ? 5.4 + (p - 0.9) * 12 : 1.55;
    const back = isArrival ? 7.2 + (p - 0.9) * 16 : 2.7;

    const point = roadCurve.getPointAt(camT);
    const tangent = roadCurve.getTangentAt(camT).normalize();

    tmpTarget.copy(point).addScaledVector(tangent, -back);
    tmpTarget.y += height;

    camera.position.copy(tmpTarget);
    camera.up.copy(tmpUp);

    tmpLook.copy(roadCurve.getPointAt(lookT));
    tmpLook.y += 0.6;
    camera.lookAt(tmpLook);
  });

  return null;
}
