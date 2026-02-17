import type { MotionFrame } from '../../types/motion'
import type { MotionSource, MotionSourceCallbacks } from './types'

export class MocapSource implements MotionSource {
  private callbacks: MotionSourceCallbacks | null = null
  private timerId: ReturnType<typeof setTimeout> | null = null
  private frameIndex = 0
  private frames: MotionFrame[] = []
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async start(callbacks: MotionSourceCallbacks) {
    this.callbacks = callbacks
    this.frameIndex = 0

    try {
      const res = await fetch(this.url)
      if (!res.ok) throw new Error(`Failed to fetch mocap data: ${res.status}`)
      this.frames = (await res.json()) as MotionFrame[]
      if (this.frames.length === 0) {
        callbacks.onError('Mocap file contains no frames.')
        return
      }
      this.scheduleNext()
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : 'Failed to load mocap data.')
    }
  }

  stop() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  dispose() {
    this.stop()
    this.callbacks = null
    this.frames = []
  }

  private scheduleNext() {
    if (this.frameIndex >= this.frames.length) {
      this.callbacks?.onDone({
        total_frames: this.frames.length,
        generation_time_ms: 0,
        model_name: 'mocap',
      })
      return
    }

    const frame = this.frames[this.frameIndex]
    const nextFrame = this.frames[this.frameIndex + 1]

    this.callbacks?.onFrame(frame)
    this.frameIndex++

    if (nextFrame) {
      const delayMs = (nextFrame.timestamp - frame.timestamp) * 1000
      this.timerId = setTimeout(() => this.scheduleNext(), Math.max(0, delayMs))
    } else {
      this.callbacks?.onDone({
        total_frames: this.frames.length,
        generation_time_ms: 0,
        model_name: 'mocap',
      })
    }
  }
}
