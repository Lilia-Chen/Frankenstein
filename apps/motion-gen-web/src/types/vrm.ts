import type { VRMHumanBoneName } from '@pixiv/three-vrm'
import type { JointName } from './motion'

/**
 * SMPL-X 22 joints → VRM humanoid bone mapping.
 *
 * SMPL-X uses Z-up (X-right Y-forward Z-up), VRM uses Y-up.
 * Adapter handles the conversion: root premultiply R = Ry(180°)·Rx(-90°),
 * joint locals pass through unchanged. pelvis is excluded from joints
 * (handled as root).
 *
 * Note: VRM chest / upperChest are optional bones — adapter must handle null.
 */
export const SMPLX_TO_VRM: Record<JointName, VRMHumanBoneName> = {
  pelvis: 'hips',
  spine1: 'spine',
  spine2: 'chest',
  spine3: 'upperChest',
  neck: 'neck',
  head: 'head',

  left_hip: 'leftUpperLeg',
  left_knee: 'leftLowerLeg',
  left_ankle: 'leftFoot',
  left_foot: 'leftToes',

  right_hip: 'rightUpperLeg',
  right_knee: 'rightLowerLeg',
  right_ankle: 'rightFoot',
  right_foot: 'rightToes',

  left_collar: 'leftShoulder',
  left_shoulder: 'leftUpperArm',
  left_elbow: 'leftLowerArm',
  left_wrist: 'leftHand',

  right_collar: 'rightShoulder',
  right_shoulder: 'rightUpperArm',
  right_elbow: 'rightLowerArm',
  right_wrist: 'rightHand',
} as Record<JointName, VRMHumanBoneName>
