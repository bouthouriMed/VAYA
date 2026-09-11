'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { roadCurve, beats, smoothstep, clamp01 } from '@/lib/curve';

const UP = new Vector3(0, 1, 0);

/**
 * A stylized, soft-edged low-poly car — VAYA's recurring "driver" actor.
 * No imported model (nothing to fabricate/source), built from rounded
 * primitives so it reads as the brand's warm/soft-edged character rather
 * than a literal vehicle render. Appears once matching completes
 * (`beats.carAppearAt`), reaches the passenger at `beats.carPickupAt`
 * (a small emissive "rider" dot fades in and rides along), then continues
 * to `beats.carEnd`.
 */
export function Car({ progressRef }: { progressRef: React.MutableRefObject<number> }): React.JSX.Element {
  const group = useRef<Group>(null);
  const riderRef = useRef<Mesh>(null);
  const riderMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#F6F1E7',
    emissive: '#3FBE85',
    emissiveIntensity: 1.4,
  }), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const progress = progressRef.current;

    // The car shares the exact same curve-position-as-scroll-progress space
    // the camera and every pin use (a fixed lead ahead of the camera's own
    // trailing offset) — so it always sits where the camera is actually
    // looking, instead of running its own, disconnected 0..1 timeline.
    const visibility = smoothstep(beats.carAppearAt - 0.03, beats.carAppearAt + 0.03, progress);
    const carPos = clamp01(progress + 0.012);
    const point = roadCurve.getPointAt(carPos);
    const tangent = roadCurve.getTangentAt(carPos);

    g.position.set(point.x, point.y + 0.42, point.z);
    g.visible = visibility > 0.01;
    const scale = 0.001 + visibility * 0.999;
    g.scale.set(scale, scale, scale);

    if (tangent.lengthSq() > 0.0001) {
      const target = point.clone().add(tangent);
      g.up.copy(UP);
      g.lookAt(target);
    }

    const riderVisibility = smoothstep(beats.carPickupAt, beats.carPickupAt + 0.04, progress);
    if (riderRef.current) {
      riderRef.current.visible = riderVisibility > 0.01;
      const rScale = 0.001 + riderVisibility * 0.999;
      riderRef.current.scale.set(rScale, rScale, rScale);
    }
  });

  return (
    <group ref={group}>
      <RoundedBox args={[1.15, 0.42, 2.3]} radius={0.16} smoothness={4} castShadow>
        <meshStandardMaterial color="#F6F1E7" roughness={0.35} metalness={0.15} />
      </RoundedBox>
      <RoundedBox
        args={[0.9, 0.34, 1.2]}
        radius={0.14}
        smoothness={4}
        position={[0, 0.36, -0.1]}
        castShadow
      >
        <meshStandardMaterial color="#20302A" roughness={0.2} metalness={0.3} transparent opacity={0.9} />
      </RoundedBox>
      {[
        [0.58, -0.16, 0.78],
        [-0.58, -0.16, 0.78],
        [0.58, -0.16, -0.78],
        [-0.58, -0.16, -0.78],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.18, 16]} />
          <meshStandardMaterial color="#0D1512" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.05, 1.2]}>
        <boxGeometry args={[0.9, 0.12, 0.06]} />
        <meshStandardMaterial color="#3FBE85" emissive="#3FBE85" emissiveIntensity={1.2} />
      </mesh>
      <mesh ref={riderRef} position={[0, 0.55, -0.1]} material={riderMaterial} visible={false}>
        <sphereGeometry args={[0.16, 16, 16]} />
      </mesh>
    </group>
  );
}
