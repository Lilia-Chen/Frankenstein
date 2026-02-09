import { initAmmo } from '@moeru/three-mmd-physics-ammo'
import { SetupPhysics } from '@moeru/three-mmd-r3f'
import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Leva } from 'leva'
import { BrightnessContrast, EffectComposer } from '@react-three/postprocessing'
import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import Viewer from './components/Viewer'

export default function App() {
  return (
    <>
      <Canvas
        camera={{ position: [0, 15, 50], fov: 45 }}
        gl={{ localClippingEnabled: true }}
        style={{ height: '100dvh', touchAction: 'none', width: '100dvw' }}
      >
        <Suspense>
          <SetupPhysics setup={initAmmo}>
            <Viewer />
            <OrbitControls target={[0, 10, 0]} />
            <ambientLight intensity={1.5} />
            <directionalLight intensity={1.64} position={[2.1, 0, 24]} rotation={[0, 2 * Math.PI, 0]} />
            <Environment background files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/belfast_sunset_puresky_2k.hdr" />
          </SetupPhysics>
        </Suspense>
      </Canvas>
      <Leva titleBar={{ title: 'MMD Controls' }} />
    </>
  )
}
