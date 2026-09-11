'use client';

import { useMemo } from 'react';
import { Stars } from '@react-three/drei';
import { roadCurve } from '@/lib/curve';

interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  windows: [number, number, number][];
}

function makeSkyline(): Building[] {
  const buildings: Building[] = [];
  // A stylized skyline near the origin (t≈0), on both sides of the road —
  // the city the trip starts in. Density and height taper off by z≈-35,
  // so the road visibly leaves the city into open corridor, matching the
  // "search → matched → travel" story rather than decorating every frame.
  const originPoint = roadCurve.getPointAt(0.02);
  let seed = 7;
  function rand(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (let i = 0; i < 22; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const lane = 6 + Math.floor(i / 2) * 3.2 + rand() * 1.4;
    const z = originPoint.z - rand() * 40 + 4;
    const height = 2.2 + rand() * rand() * 9;
    const width = 1.6 + rand() * 1.4;
    const depth = 1.6 + rand() * 1.4;
    const x = originPoint.x + side * lane;
    const windowCount = Math.max(2, Math.floor(height * 1.3));
    const windows: [number, number, number][] = Array.from({ length: windowCount }, () => [
      (rand() - 0.5) * (width * 0.6),
      rand() * height * 0.85 + height * 0.05,
      (rand() - 0.5) * (depth * 0.6),
    ]);
    buildings.push({ x, z, width, depth, height, windows });
  }
  return buildings;
}

export function Environment(): React.JSX.Element {
  const buildings = useMemo(() => makeSkyline(), []);

  return (
    <group>
      <Stars radius={140} depth={60} count={2200} factor={2.4} saturation={0} fade speed={0.35} />
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position={[0, b.height / 2, 0]}>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshStandardMaterial color="#131E19" roughness={0.9} metalness={0.05} />
          </mesh>
          {b.windows.map((w, wi) => (
            <mesh key={wi} position={w}>
              <boxGeometry args={[0.09, 0.14, 0.02]} />
              <meshStandardMaterial
                color="#F2CE8C"
                emissive="#F2CE8C"
                emissiveIntensity={1.6}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
