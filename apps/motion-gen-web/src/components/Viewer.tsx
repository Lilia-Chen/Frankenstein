import { useMMD } from '@moeru/three-mmd-r3f'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { MotionPlayer } from '../motion/player'
import { applyMotionFrameToSkeleton, createMmdBoneMap } from '../motion/adapter'
import pmxUrl from '../../public/assets/Endmin(B.)配布用/Endmin(.B)_v1.0.pmx?url'

type ViewerProps = {
  player: MotionPlayer
}

const Viewer = ({ player }: ViewerProps) => {
  const {
    mmdScale,
    showSkeleton,
    showAxes,
  } = useControls({
    mmdScale: {
      max: 10,
      min: 0.01,
      step: 0.01,
      value: 1,
    },
    showSkeleton: false,
    showAxes: false,
  })

  const mmd = useMMD(pmxUrl)
  const boneMap = useMemo(() => createMmdBoneMap(mmd.mesh), [mmd.mesh])
  const axesHelpersRef = useRef<Map<string, THREE.AxesHelper>>(new Map())

  // Scale handling
  useEffect(() => {
    mmd.setScalar(mmdScale)
  }, [mmd, mmdScale])

  // Debug axes helpers for root and wrists
  useEffect(() => {
    const helperSize = 0.25
    const targets = [
      { key: 'root', bone: boneMap.root },
      { key: 'left_wrist', bone: boneMap.joints.left_wrist },
      { key: 'right_wrist', bone: boneMap.joints.right_wrist },
    ]

    for (const { key, bone } of targets) {
      if (!bone) continue
      let helper = axesHelpersRef.current.get(key)
      if (!helper) {
        helper = new THREE.AxesHelper(helperSize)
        axesHelpersRef.current.set(key, helper)
      }
      if (showAxes) {
        if (helper.parent !== bone) bone.add(helper)
      } else {
        helper.removeFromParent()
      }
    }

    return () => {
      for (const helper of axesHelpersRef.current.values()) {
        helper.removeFromParent()
      }
    }
  }, [boneMap, showAxes])

  useFrame(() => {
    const frame = player.getFrameAtNow()
    if (!frame) return
    applyMotionFrameToSkeleton(frame, boneMap)
    mmd.mesh.updateMatrixWorld(true)
  })

  return (
    <>
      <primitive object={mmd.mesh} />
      {showSkeleton && <skeletonHelper args={[mmd.mesh]} />}
    </>
  )
}

export default Viewer
