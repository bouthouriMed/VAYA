'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';
import { roadCurve } from '@/lib/curve';

/**
 * A small bright pulse continuously traveling the length of the route —
 * time-driven, not scroll-driven, so the scene has ambient life even while
 * the visitor holds still mid-scroll instead of feeling like a paused
 * slideshow. Reads as "the route is live," reinforcing the real-routing
 * product claim rather than being pure decoration.
 */
export function SignalPulse({ speed = 0.06, offset = 0 }: { speed?: number; offset?: number }): React.JSX.Element {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const point = roadCurve.getPointAt(t);
    m.position.set(point.x, point.y + 0.16, point.z);
    const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 6) * 0.2;
    m.scale.setScalar(pulse);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.075, 12, 12]} />
      <meshStandardMaterial color="#B7F0D2" emissive="#B7F0D2" emissiveIntensity={2.2} toneMapped={false} />
    </mesh>
  );
}
