import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import { SkeletonHelper } from 'three'
import { useVRM } from '../hooks/use-vrm'
import { applyMotionFrameToVrm, applyMotionFrameFromDart, createVrmBoneMap, readVrmToMotionFrame, readVrmToMotionFrameForDart } from '../pipeline/adapter'
import type { MotionFrame } from '../types/motion'
import type { MotionPlayer } from '../pipeline/player'

export type BackendType = 'default' | 'dart'

interface VrmViewerProps {
  modelUrl: string
  player: MotionPlayer
  backend?: BackendType
  onStateUpdate?: (frame: MotionFrame) => void
}

const STATE_UPDATE_INTERVAL = 1 / 30

export default function VrmViewer({ modelUrl, player, backend = 'default', onStateUpdate }: VrmViewerProps) {
  const vrm = useVRM(modelUrl)
  const boneMap = useMemo(() => createVrmBoneMap(vrm), [vrm])
  const applyFn = backend === 'dart' ? applyMotionFrameFromDart : applyMotionFrameToVrm
  const stateUpdateAccRef = useRef(0)

  const { showSkeleton, showAxes, axesSize } = useControls('VRM Debug', {
    showSkeleton: false,
    showAxes: true,
    axesSize: { value: 1, min: 0.1, max: 5, step: 0.1 },
  })

  const skeletonHelper = useMemo(() => {
    return new SkeletonHelper(vrm.scene)
  }, [vrm])

  const readFn = backend === 'dart' ? readVrmToMotionFrameForDart : readVrmToMotionFrame

  useFrame((_, delta) => {
    const frame = player.getFrameAtNow()
    if (frame) {
      applyFn(frame, boneMap)
    }
    vrm.update(delta)

    if (onStateUpdate) {
      stateUpdateAccRef.current += delta
      if (stateUpdateAccRef.current >= STATE_UPDATE_INTERVAL) {
        stateUpdateAccRef.current = 0
        onStateUpdate(readFn(boneMap, performance.now() / 1000))
      }
    }
  })

  return (
    <>
      <primitive object={vrm.scene} />
      {showSkeleton && <primitive object={skeletonHelper} />}
      {showAxes && <axesHelper args={[axesSize]} />}
    </>
  )
}
