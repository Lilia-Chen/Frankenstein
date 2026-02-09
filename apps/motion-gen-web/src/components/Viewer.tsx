import { MMDAmmoPhysics } from '@moeru/three-mmd-physics-ammo'
import { useMMD, useMMDPhysics } from '@moeru/three-mmd-r3f'
import { useControls } from 'leva'
import { useEffect, useState } from 'react'

import pmxUrl from '../../public/assets/Endmin(B.)配布用/Endmin(.B)_v1.0.pmx?url'

const Viewer = () => {
  const [editingScale, setEditingScale] = useState(false)
  const {
    mmdScale,
    showPhysics,
    showSkeleton,
  } = useControls({
    mmdScale: {
      max: 10,
      min: 0.01,
      onEditEnd: () => setEditingScale(false),
      onEditStart: () => setEditingScale(true),
      step: 0.01,
      value: 1,
    },
    showPhysics: false,
    showSkeleton: false,
  })

  const mmd = useMMD(pmxUrl)
  const physicsHelper = useMMDPhysics(mmd, MMDAmmoPhysics, editingScale)

  // Scale handling
  useEffect(() => {
    mmd.setScalar(mmdScale)
  }, [mmd, mmdScale])

  return (
    <>
      <primitive object={mmd.mesh} />
      {showSkeleton && <skeletonHelper args={[mmd.mesh]} />}
      {showPhysics && physicsHelper && <primitive object={physicsHelper} />}
    </>
  )
}

export default Viewer
