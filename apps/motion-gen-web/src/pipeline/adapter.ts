import type { VRM } from '@pixiv/three-vrm'
import { Euler, Object3D, Quaternion } from 'three'
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
    if (joint === 'pelvis') continue // root is handled separately
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

// ── Reusable temporaries ──
const _q = new Quaternion()
const _r = new Quaternion()
const _prev = new Map<Object3D, Quaternion>()

/**
 * Stabilize quaternion to prevent sign-flip discontinuities.
 */
function stabilize(node: Object3D, x: number, y: number, z: number, w: number): Quaternion {
  _q.set(x, y, z, w)
  let prev = _prev.get(node)
  if (!prev) {
    prev = new Quaternion()
    _prev.set(node, prev)
  }
  if (prev.dot(_q) < 0) {
    _q.set(-x, -y, -z, -w)
  }
  prev.copy(_q)
  return _q
}

/**
 * Apply a MotionFrame to VRM skeleton (direct, no coordinate conversion).
 * Use this when the backend already sends Y-up data (e.g. motionStream).
 */
export function applyMotionFrameToVrm(frame: MotionFrame, boneMap: VrmBoneMap): void {
  if (boneMap.root) {
    const [px, py, pz] = frame.root_position
    boneMap.root.position.set(px, py, pz)

    const [rx, ry, rz, rw] = frame.root_rotation
    const sq = stabilize(boneMap.root, rx, ry, rz, rw)
    boneMap.root.quaternion.copy(sq)
  }

  for (const [joint, quat] of Object.entries(frame.joint_rotations)) {
    if (joint === 'pelvis') continue
    const node = boneMap.joints[joint as JointName]
    if (!node || !quat) continue

    const [jx, jy, jz, jw] = quat as QuaternionTuple
    const sq = stabilize(node, jx, jy, jz, jw)
    node.quaternion.copy(sq)
  }
}

/**
 * World-space rotation fix for DART backend (Z-up → Y-up):
 * R = Ry(180°) * Rx(-90°)  (quaternion: [0, √2/2, √2/2, 0])
 *
 * Position:  [x, y, z] → [-x, z, y]
 * Root rot:  q' = R * q   (premultiply — NOT conjugation)
 * Joint rot: unchanged    (FK proves locals are invariant under world rotation)
 */
const _R = new Quaternion()
  .setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'))
  .premultiply(new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'XYZ')))

const _R_conj = _R.clone().conjugate()

/**
 * Apply a MotionFrame to VRM skeleton with DART Z-up → Y-up conversion.
 * Use this when the backend is DART (sends Z-up / SMPL-X native data).
 */
export function applyMotionFrameFromDart(frame: MotionFrame, boneMap: VrmBoneMap): void {
  if (boneMap.root) {
    const [px, py, pz] = frame.root_position
    boneMap.root.position.set(-px, pz, py)

    const [rx, ry, rz, rw] = frame.root_rotation
    _r.set(rx, ry, rz, rw)
    _r.premultiply(_R) // q' = R * q
    const sq = stabilize(boneMap.root, _r.x, _r.y, _r.z, _r.w)
    boneMap.root.quaternion.copy(sq)
  }

  for (const [joint, quat] of Object.entries(frame.joint_rotations)) {
    if (joint === 'pelvis') continue
    const node = boneMap.joints[joint as JointName]
    if (!node || !quat) continue

    const [jx, jy, jz, jw] = quat as QuaternionTuple
    const sq = stabilize(node, jx, jy, jz, jw)
    node.quaternion.copy(sq)
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

/**
 * Read current VRM skeleton state into a MotionFrame in DART space (Y-up → Z-up).
 * Inverse of applyMotionFrameFromDart. Since R is self-inverse (R²=I),
 * the transform is identical: position [-x,z,y], root rotation R*q.
 * Joint rotations are invariant under world rotation.
 */
export function readVrmToMotionFrameForDart(boneMap: VrmBoneMap, timestamp: number): MotionFrame {
  const frame = readVrmToMotionFrame(boneMap, timestamp)

  const [px, py, pz] = frame.root_position
  const [rx, ry, rz, rw] = frame.root_rotation
  _r.set(rx, ry, rz, rw).premultiply(_R_conj)

  return {
    ...frame,
    root_position: [-px, pz, py],
    root_rotation: [_r.x, _r.y, _r.z, _r.w],
  }
}
