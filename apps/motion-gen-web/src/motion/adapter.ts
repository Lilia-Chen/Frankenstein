import type { JointName, MotionFrame } from '../types/motion'
import * as THREE from 'three'

export const SMPLX_TO_MMD: Record<JointName, string> = {
  pelvis: 'センター',
  spine1: '上半身',
  spine2: '上半身1',
  spine3: '上半身2',
  neck: '首',
  head: '頭',
  left_hip: '左足',
  left_knee: '左ひざ',
  left_ankle: '左足首',
  left_foot: '左つま先',
  right_hip: '右足',
  right_knee: '右ひざ',
  right_ankle: '右足首',
  right_foot: '右つま先',
  left_collar: '左肩',
  left_shoulder: '左腕',
  left_elbow: '左ひじ',
  left_wrist: '左手首',
  right_collar: '右肩',
  right_shoulder: '右腕',
  right_elbow: '右ひじ',
  right_wrist: '右手首',
}


export type MmdBoneMap = {
  root: THREE.Bone | null
  joints: Record<JointName, THREE.Bone | null>
  rest: {
    rootPosition: THREE.Vector3
    rootQuaternion: THREE.Quaternion
    jointQuaternions: Record<JointName, THREE.Quaternion>
  }
  last: {
    rootQuaternion: THREE.Quaternion
    jointQuaternions: Record<JointName, THREE.Quaternion>
  }
}

export function createMmdBoneMap(mesh: THREE.SkinnedMesh): MmdBoneMap {
  const skeleton = mesh.skeleton
  const joints = {} as Record<JointName, THREE.Bone | null>
  const jointQuaternions = {} as Record<JointName, THREE.Quaternion>
  for (const joint of Object.keys(SMPLX_TO_MMD) as JointName[]) {
    const bone = skeleton.getBoneByName(SMPLX_TO_MMD[joint]) ?? null
    joints[joint] = bone
    jointQuaternions[joint] = bone?.quaternion.clone() ?? new THREE.Quaternion()
  }
  const root = skeleton.getBoneByName('センター') ?? null
  return {
    root,
    joints,
    rest: {
      rootPosition: root?.position.clone() ?? new THREE.Vector3(),
      rootQuaternion: root?.quaternion.clone() ?? new THREE.Quaternion(),
      jointQuaternions,
    },
    last: {
      rootQuaternion: new THREE.Quaternion(),
      jointQuaternions: Object.fromEntries(
        (Object.keys(SMPLX_TO_MMD) as JointName[]).map((j) => [j, new THREE.Quaternion()])
      ) as Record<JointName, THREE.Quaternion>,
    },
  }
}

/**
 * Apply SMPL-X motion frame to MMD skeleton.
 *
 * NOTE: If the character lies down or left/right looks mirrored, the incoming
 * motion coordinate basis does NOT match the MMD model's basis. In that case,
 * we must convert the basis for both translations and rotations.
 *
 * Quaternion format: xyzw (backend converts from PyTorch3D wxyz).
 *
 * root_rotation / joint_rotations["pelvis"] → world space, applied to センター
 * All other joint_rotations → local space relative to SMPL-X parent bone
 */

// SMPL-X native coordinate system (no conversion): right-handed, +X right, +Y up, +Z forward.
// Backend explicitly states outputs are already in this space.
function convertMotionVector(vec: THREE.Vector3): THREE.Vector3 {
  return vec
}

function convertMotionQuaternion(quat: THREE.Quaternion): THREE.Quaternion {
  return quat
}
function stabilizeQuaternion(current: THREE.Quaternion, previous: THREE.Quaternion): THREE.Quaternion {
  if (previous.lengthSq() === 0) return current
  // Ensure same hemisphere to avoid sudden flips.
  if (current.dot(previous) < 0) current.multiplyScalar(-1)
  return current
}

export function applyMotionFrameToSkeleton(frame: MotionFrame, boneMap: MmdBoneMap): void {
  const { root, joints, last } = boneMap
  // Root (pelvis): world-space rotation + translation
  if (root) {
    const [x, y, z] = frame.root_translation
    const translated = convertMotionVector(new THREE.Vector3(x, y, z))
    root.position.copy(translated)
    const [qx, qy, qz, qw] = frame.root_rotation
    const converted = convertMotionQuaternion(new THREE.Quaternion(qx, qy, qz, qw).normalize())
    stabilizeQuaternion(converted, last.rootQuaternion)
    root.quaternion.copy(converted).normalize()
    last.rootQuaternion.copy(root.quaternion)
  }

  // Other joints: local-space rotations (skip pelvis — already handled above)
  for (const [joint, rotation] of Object.entries(frame.joint_rotations)) {
    if (joint === 'pelvis') continue
    const bone = joints[joint as JointName]
    if (!bone) continue
    const [qx, qy, qz, qw] = rotation
    const converted = convertMotionQuaternion(new THREE.Quaternion(qx, qy, qz, qw).normalize())
    const prev = last.jointQuaternions[joint as JointName]
    stabilizeQuaternion(converted, prev)
    bone.quaternion.copy(converted).normalize()
    prev.copy(bone.quaternion)
  }
}

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1]

/**
 * Read current MMD skeleton state and convert to SMPL-X MotionFrame.
 * Inverse of applyMotionFrameToSkeleton.
 */
export function readSkeletonToMotionFrame(boneMap: MmdBoneMap): MotionFrame {
  const { root, joints } = boneMap

  const root_translation: [number, number, number] = root
    ? [root.position.x, root.position.y, root.position.z]
    : [0, 0, 0]

  const root_rotation: [number, number, number, number] = root
    ? [root.quaternion.x, root.quaternion.y, root.quaternion.z, root.quaternion.w]
    : IDENTITY_QUAT

  const joint_rotations = {} as Record<JointName, [number, number, number, number]>
  for (const joint of Object.keys(SMPLX_TO_MMD) as JointName[]) {
    if (joint === 'pelvis') {
      // pelvis = root_rotation (world space)
      joint_rotations[joint] = root_rotation
      continue
    }
    const bone = joints[joint]
    joint_rotations[joint] = bone
      ? [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w]
      : IDENTITY_QUAT
  }

  return {
    index: 0,
    timestamp: 0,
    root_translation,
    root_rotation,
    joint_rotations,
  }
}
