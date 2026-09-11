'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Road } from './Road';
import { Car } from './Car';
import { Pin } from './Pin';
import { CameraRig } from './CameraRig';
import { Environment } from './Environment';
import { SignalPulse } from './SignalPulse';
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
      <fog attach="fog" args={['#0D1512', 16, 58]} />
      <PerspectiveCamera makeDefault fov={36} near={0.1} far={220} position={[0, 1, 3]} />
      <CameraRig progressRef={progressRef} />
      <ambientLight intensity={0.42} color="#9FC2CC" />
      <hemisphereLight args={['#3FBE85', '#0D1512', 0.35]} />
      <directionalLight position={[8, 14, 6]} intensity={1.15} color="#F6F1E7" />
      <directionalLight position={[-10, 6, -8]} intensity={0.4} color="#3FBE85" />

      <Suspense fallback={null}>
        <Environment />
        <Road />
        <SignalPulse speed={0.05} offset={0} />
        <SignalPulse speed={0.05} offset={0.5} />
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

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.85}
          luminanceThreshold={0.35}
          luminanceSmoothing={0.25}
          mipmapBlur
          radius={0.6}
        />
        <Vignette eskil={false} offset={0.25} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
