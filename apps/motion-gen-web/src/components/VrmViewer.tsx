import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useMemo } from 'react'
import { SkeletonHelper } from 'three'
import { useVRM } from '../hooks/use-vrm'
import { applyMotionFrameToVrm, applyMotionFrameFromDart, createVrmBoneMap } from '../pipeline/adapter'
import type { MotionPlayer } from '../pipeline/player'

export type BackendType = 'default' | 'dart'

interface VrmViewerProps {
  modelUrl: string
  player: MotionPlayer
  backend?: BackendType
}

export default function VrmViewer({ modelUrl, player, backend = 'default' }: VrmViewerProps) {
  const vrm = useVRM(modelUrl)
  const boneMap = useMemo(() => createVrmBoneMap(vrm), [vrm])
  const applyFn = backend === 'dart' ? applyMotionFrameFromDart : applyMotionFrameToVrm

  const { showSkeleton, showAxes, axesSize } = useControls('VRM Debug', {
    showSkeleton: false,
    showAxes: true,
    axesSize: { value: 1, min: 0.1, max: 5, step: 0.1 },
  })

  const skeletonHelper = useMemo(() => {
    return new SkeletonHelper(vrm.scene)
  }, [vrm])

  useFrame((_, delta) => {
    const frame = player.getFrameAtNow()
    if (frame) {
      applyFn(frame, boneMap)
    }
    vrm.update(delta)
  })

  return (
    <>
      <primitive object={vrm.scene} />
      {showSkeleton && <primitive object={skeletonHelper} />}
      {showAxes && <axesHelper args={[axesSize]} />}
    </>
  )
}
