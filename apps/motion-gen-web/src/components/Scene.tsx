import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'

interface SceneProps {
  children: ReactNode
}

export default function Scene({ children }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 3], fov: 45 }}
      style={{ height: '100dvh', width: '100dvw', touchAction: 'none' }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight intensity={1.5} position={[3, 5, 3]} />
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#6f6f6f"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#9f9f9f"
        fadeDistance={20}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls target={[0, 1, 0]} />
      {children}
    </Canvas>
  )
}
