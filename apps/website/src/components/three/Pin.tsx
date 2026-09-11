'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { roadCurve, smoothstep } from '@/lib/curve';

interface PinProps {
  t: number;
  showFrom: number;
  showTo: number;
  selected?: boolean;
  color?: string;
  progressRef: React.MutableRefObject<number>;
  side?: number;
}

/** A pickup/dropoff marker: a slim stem + sphere head, matching the real
 *  app's pin language (`mapPickupMarker` navy, `accent` sage/emerald for
 *  a selected/confirmed stop). Fades and settles in on scroll rather than
 *  popping, so new geometry appearing mid-scroll reads as "arriving" not
 *  "glitching in". */
export function Pin({
  t,
  showFrom,
  showTo,
  selected = false,
  color = '#2E3B42',
  progressRef,
  side = 0,
}: PinProps): React.JSX.Element {
  const group = useRef<Group>(null);
  const point = roadCurve.getPointAt(t);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const progress = progressRef.current;
    const fadeIn = smoothstep(showFrom, showFrom + 0.03, progress);
    const fadeOut = 1 - smoothstep(showTo - 0.03, showTo, progress);
    const visibility = Math.min(fadeIn, showTo >= 1 ? 1 : fadeOut);
    g.visible = visibility > 0.01;
    const baseScale = selected ? 1.15 : 0.85;
    const bob = selected ? Math.sin(state.clock.elapsedTime * 1.6) * 0.04 : 0;
    const s = baseScale * (0.001 + visibility * 0.999);
    g.scale.set(s, s, s);
    g.position.y = point.y + 0.02 + bob * visibility;
  });

  return (
    <group ref={group} position={[point.x + side, point.y, point.z]}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.05, 0.09, 0.7, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial
          color={selected ? '#3FBE85' : color}
          emissive={selected ? '#3FBE85' : '#000000'}
          emissiveIntensity={selected ? 1.1 : 0}
          roughness={0.3}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.44, 32]} />
          <meshStandardMaterial
            color="#3FBE85"
            emissive="#3FBE85"
            emissiveIntensity={0.8}
            transparent
            opacity={0.55}
          />
        </mesh>
      )}
    </group>
  );
}
