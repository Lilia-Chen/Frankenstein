import type { JointName, MotionFrame } from '../types/motion'

export const SMPLX_TO_MMD: Record<JointName, string> = {
  pelvis: 'センター',
  spine1: '上半身',
  spine2: '上半身2',
  spine3: '上半身3',
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

export function applyMotionFrameToSkeleton(_frame: MotionFrame): void {
  // Placeholder for next phase where we bind frame quaternions to concrete MMD bones.
}

