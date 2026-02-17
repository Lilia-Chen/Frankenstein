import type { VRM } from '@pixiv/three-vrm'
import { Object3D, Quaternion } from 'three'
import type { JointName, MotionFrame, QuaternionTuple } from '../types/motion'
import { SMPLX_TO_VRM } from '../types/vrm'

export interface VrmBoneMap {
  root: Object3D | null
  joints: Partial<Record<JointName, Object3D>>
}

/**
 * Build a cached bone reference map from VRM humanoid.
 * Uses getNormalizedBoneNode (standard T-pose), not getRawBoneNode.
 */
export function createVrmBoneMap(vrm: VRM): VrmBoneMap {
  const joints: Partial<Record<JointName, Object3D>> = {}

  for (const [joint, vrmBone] of Object.entries(SMPLX_TO_VRM)) {
    const node = vrm.humanoid.getNormalizedBoneNode(vrmBone)
    if (node) {
      joints[joint as JointName] = node
    }
  }

  return {
    root: vrm.humanoid.getNormalizedBoneNode('hips'),
    joints,
  }
}

// Reusable quaternion to avoid per-frame allocation
const _q = new Quaternion()
const _prev = new Map<Object3D, Quaternion>()

/**
 * Stabilize quaternion to prevent sign-flip discontinuities.
 * If the new quaternion is in the opposite hemisphere from the previous one,
 * negate it (they represent the same rotation).
 */
function stabilize(node: Object3D, x: number, y: number, z: number, w: number): Quaternion {
  _q.set(x, y, z, w)
  const prev = _prev.get(node)
  if (prev && prev.dot(_q) < 0) {
    _q.set(-x, -y, -z, -w)
  }
  _prev.set(node, _q.clone())
  return _q
}

/**
 * Apply a MotionFrame to VRM skeleton.
 * Root gets world-space position + rotation; joints get local quaternion rotations.
 */
export function applyMotionFrameToVrm(frame: MotionFrame, boneMap: VrmBoneMap): void {
  // Root position + rotation
  if (boneMap.root) {
    const [px, py, pz] = frame.root_position
    boneMap.root.position.set(px, py, pz)

    const [rx, ry, rz, rw] = frame.root_rotation
    const rq = stabilize(boneMap.root, rx, ry, rz, rw)
    boneMap.root.quaternion.copy(rq)
  }

  // Joint local rotations
  for (const [joint, quat] of Object.entries(frame.joint_rotations)) {
    const node = boneMap.joints[joint as JointName]
    if (!node || !quat) continue

    const [x, y, z, w] = quat as QuaternionTuple
    const q = stabilize(node, x, y, z, w)
    node.quaternion.copy(q)
  }
}

/**
 * Read current VRM skeleton state into a MotionFrame.
 */
export function readVrmToMotionFrame(boneMap: VrmBoneMap, timestamp: number): MotionFrame {
  const joint_rotations: Partial<Record<JointName, QuaternionTuple>> = {}

  for (const [joint, node] of Object.entries(boneMap.joints)) {
    if (!node) continue
    const q = node.quaternion
    joint_rotations[joint as JointName] = [q.x, q.y, q.z, q.w]
  }

  const rootPos = boneMap.root?.position
  const rootRot = boneMap.root?.quaternion

  return {
    timestamp,
    root_position: rootPos ? [rootPos.x, rootPos.y, rootPos.z] : [0, 0, 0],
    root_rotation: rootRot ? [rootRot.x, rootRot.y, rootRot.z, rootRot.w] : [0, 0, 0, 1],
    joint_rotations,
  }
}
