// ── Core data types ──

export type QuaternionTuple = [x: number, y: number, z: number, w: number]

export interface MotionFrame {
  timestamp: number

  // Root (world space)
  root_position: [number, number, number]
  root_rotation: QuaternionTuple

  // Joint rotations (local space, relative to parent bone)
  // Standard joint names use SMPL-X naming (pelvis, spine1, spine2, ...)
  joint_rotations: Partial<Record<JointName, QuaternionTuple>>

  // Optional: joint world positions (for Layer 4 spatial queries)
  joint_positions?: Partial<Record<JointName, [number, number, number]>>

  // Optional: velocity info (for until-condition evaluation and guidance)
  root_velocity?: [number, number, number]
}

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

// ── ConditioningSpec (Layer 2 → Layer 3) ──

export interface ConditioningSpec {
  text?: string

  spatial?: {
    target_position?: [number, number, number]
    target_facing?: [number, number, number]
    waypoints?: [number, number, number][]
  }

  trajectory?: {
    joint_targets?: Record<string, [number, number, number]>
    velocity?: [number, number, number]
  }

  transition?: {
    from_skill?: string
    to_skill?: string
    blend_duration?: number
    intermediate_waypoints?: [number, number, number][]
  }
}

// ── Generator capabilities handshake ──

export interface GeneratorCapabilities {
  supportsText: boolean
  supportsSpatial: boolean
  supportsTrajectory: boolean
  supportsTransition: boolean
}

// ── WebSocket message types ──

export interface GenerateRequest {
  type: 'generate'
  id: string
  payload: {
    conditioning: ConditioningSpec
    duration_seconds?: number
    fps?: number
    current_frame?: MotionFrame
  }
}

export interface CancelRequest {
  type: 'cancel'
  id: string
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

export interface HandshakeMessage {
  type: 'handshake'
  capabilities: GeneratorCapabilities
}

export type ServerMessage = FrameMessage | DoneMessage | ErrorMessage | HandshakeMessage
