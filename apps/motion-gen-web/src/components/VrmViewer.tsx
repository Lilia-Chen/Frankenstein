import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useMemo } from 'react'
import { SkeletonHelper } from 'three'
import { useVRM } from '../hooks/use-vrm'
import { applyMotionFrameToVrm, createVrmBoneMap } from '../pipeline/adapter'
import type { MotionPlayer } from '../pipeline/player'

interface VrmViewerProps {
  modelUrl: string
  player: MotionPlayer
}

export default function VrmViewer({ modelUrl, player }: VrmViewerProps) {
  const vrm = useVRM(modelUrl)
  const boneMap = useMemo(() => createVrmBoneMap(vrm), [vrm])

  const { showSkeleton } = useControls('VRM Debug', {
    showSkeleton: false,
  })

  const skeletonHelper = useMemo(() => {
    return new SkeletonHelper(vrm.scene)
  }, [vrm])

  useFrame((_, delta) => {
    const frame = player.getFrameAtNow()
    if (frame) {
      applyMotionFrameToVrm(frame, boneMap)
    }
    vrm.update(delta)
  })

  return (
    <>
      <primitive object={vrm.scene} />
      {showSkeleton && <primitive object={skeletonHelper} />}
    </>
  )
}
