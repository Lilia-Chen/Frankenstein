import type { MotionFrame } from '../types/motion'

export class MotionPlayer {
  private readonly frames: MotionFrame[] = []
  private startWallTimeMs: number | null = null
  private running = false

  get frameCount(): number {
    return this.frames.length
  }

  get isRunning(): boolean {
    return this.running
  }

  start() {
    this.running = true
    if (this.startWallTimeMs === null) {
      this.startWallTimeMs = performance.now()
    }
  }

  stop() {
    this.running = false
  }

  reset() {
    this.frames.length = 0
    this.startWallTimeMs = this.running ? performance.now() : null
  }

  pushFrame(frame: MotionFrame) {
    this.frames.push(frame)
  }

  getFrameAtNow(): MotionFrame | null {
    if (!this.running || this.startWallTimeMs === null || this.frames.length === 0) {
      return null
    }
    const elapsedSeconds = (performance.now() - this.startWallTimeMs) / 1000
    let latest: MotionFrame | null = null
    for (const frame of this.frames) {
      if (frame.timestamp <= elapsedSeconds) {
        latest = frame
      } else {
        break
      }
    }
    return latest ?? this.frames[0]
  }
}
