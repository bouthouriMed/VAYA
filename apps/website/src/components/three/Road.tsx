'use client';

import { useMemo } from 'react';
import { TubeGeometry, DoubleSide } from 'three';
import { roadCurve } from '@/lib/curve';

/**
 * The recurring visual element: a flattened tube following `roadCurve` as
 * the asphalt ribbon, with a slimmer, accent-lit tube just above it as the
 * route line — the same sage tone (`route`) the real in-app map uses for
 * a confirmed route polyline, so the 3D motif reads as the same visual
 * language as the product, not a decorative green.
 */
export function Road(): React.JSX.Element {
  const roadGeometry = useMemo(
    () => new TubeGeometry(roadCurve, 220, 1.7, 12, false),
    []
  );
  const lineGeometry = useMemo(
    () => new TubeGeometry(roadCurve, 220, 0.09, 8, false),
    []
  );

  return (
    <group>
      <mesh geometry={roadGeometry} scale={[1, 0.05, 1]} receiveShadow>
        <meshStandardMaterial
          color="#2C3A34"
          roughness={0.85}
          metalness={0.08}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={lineGeometry} position={[0, 0.14, 0]}>
        <meshStandardMaterial
          color="#7FA491"
          emissive="#7FA491"
          emissiveIntensity={0.9}
          roughness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  );
}
