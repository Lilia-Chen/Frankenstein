export type JointName =
  | 'pelvis'
  | 'spine1'
  | 'spine2'
  | 'spine3'
  | 'neck'
  | 'head'
  | 'left_hip'
  | 'left_knee'
  | 'left_ankle'
  | 'left_foot'
  | 'right_hip'
  | 'right_knee'
  | 'right_ankle'
  | 'right_foot'
  | 'left_collar'
  | 'left_shoulder'
  | 'left_elbow'
  | 'left_wrist'
  | 'right_collar'
  | 'right_shoulder'
  | 'right_elbow'
  | 'right_wrist'

export interface MotionFrame {
  index: number
  timestamp: number
  root_translation: [number, number, number]
  root_rotation: [number, number, number, number]
  joint_rotations: Record<JointName, [number, number, number, number]>
}

export interface GenerateRequest {
  type: 'generate'
  id: string
  payload: {
    text_prompt: string
    duration_seconds?: number
    fps?: number
    current_frame?: MotionFrame
  }
}

export interface CancelRequest {
  type: 'cancel'
  id: string
}

export interface CurrentFrameRequest {
  type: 'current_frame'
  id: string
  frame: MotionFrame
}

export interface FrameMessage {
  type: 'frame'
  id: string
  frame: MotionFrame
}

export interface DoneMessage {
  type: 'done'
  id: string
  metadata: {
    total_frames: number
    generation_time_ms: number
    model_name: string
  }
}

export interface ErrorMessage {
  type: 'error'
  id: string
  error: string
}

export type MotionSocketServerMessage = FrameMessage | DoneMessage | ErrorMessage

