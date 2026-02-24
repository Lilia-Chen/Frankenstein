import type { MotionFrame, GeneratorCapabilities } from '../../types/motion'

export interface MotionSourceCallbacks {
  onFrame: (frame: MotionFrame, id?: string) => void
  onDone: (metadata: { total_frames: number; generation_time_ms: number; model_name: string }, id?: string) => void
  onError: (message: string) => void
  onCapabilities?: (capabilities: GeneratorCapabilities) => void
}

export interface MotionSource {
  start(callbacks: MotionSourceCallbacks): void
  stop(): void
  dispose(): void
}
