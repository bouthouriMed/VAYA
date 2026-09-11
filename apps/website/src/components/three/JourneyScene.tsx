'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Road } from './Road';
import { Car } from './Car';
import { Pin } from './Pin';
import { CameraRig } from './CameraRig';
import { beats } from '@/lib/curve';

export function JourneyScene({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}): React.JSX.Element {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <color attach="background" args={['#0D1512']} />
      <fog attach="fog" args={['#0D1512', 14, 52]} />
      <PerspectiveCamera makeDefault fov={46} near={0.1} far={200} position={[0, 3, 8]} />
      <CameraRig progressRef={progressRef} />
      <ambientLight intensity={0.85} color="#9FC2CC" />
      <hemisphereLight args={['#3FBE85', '#0D1512', 0.4]} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} color="#F6F1E7" />
      <directionalLight position={[-10, 6, -8]} intensity={0.55} color="#3FBE85" />

      <Suspense fallback={null}>
        <Road />
        <Car progressRef={progressRef} />
        <Pin
          t={beats.origin.t}
          showFrom={beats.origin.showFrom}
          showTo={beats.origin.showTo}
          color="#DDE6DE"
          progressRef={progressRef}
        />
        {beats.candidates.map((c, i) => (
          <Pin
            key={i}
            t={c.t}
            showFrom={c.showFrom}
            showTo={c.showTo}
            selected={c.selected}
            color="#7FA491"
            progressRef={progressRef}
            side={(i - 1) * 0.55}
          />
        ))}
        <Pin
          t={beats.destination.t}
          showFrom={beats.destination.showFrom}
          showTo={beats.destination.showTo}
          selected
          color="#DDE6DE"
          progressRef={progressRef}
        />
      </Suspense>
    </Canvas>
  );
}
