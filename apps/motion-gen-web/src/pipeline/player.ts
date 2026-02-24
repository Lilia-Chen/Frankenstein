import { Quaternion } from 'three'
import type { JointName, MotionFrame, QuaternionTuple } from '../types/motion'

const BLEND_DURATION = 0.2 // seconds

const _qa = new Quaternion()
const _qb = new Quaternion()

function blendFrames(a: MotionFrame, b: MotionFrame, t: number): MotionFrame {
  const lerpV3 = (u: [number, number, number], v: [number, number, number]): [number, number, number] =>
    [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t]

  const slerpQ = (u: QuaternionTuple, v: QuaternionTuple): QuaternionTuple => {
    _qa.set(u[0], u[1], u[2], u[3])
    _qb.set(v[0], v[1], v[2], v[3])
    _qa.slerp(_qb, t)
    return [_qa.x, _qa.y, _qa.z, _qa.w]
  }

  const joint_rotations: Partial<Record<JointName, QuaternionTuple>> = { ...a.joint_rotations }
  for (const k of Object.keys(b.joint_rotations) as JointName[]) {
    const au = a.joint_rotations[k], bv = b.joint_rotations[k]
    if (au && bv) joint_rotations[k] = slerpQ(au, bv)
    else if (bv) joint_rotations[k] = bv
  }

  return {
    timestamp: b.timestamp,
    root_position: lerpV3(a.root_position, b.root_position),
    root_rotation: slerpQ(a.root_rotation, b.root_rotation),
    joint_rotations,
  }
}

export class MotionPlayer {
  private readonly frames: MotionFrame[] = []
  private startWallTimeMs: number | null = null
  private running = false
  private fromFrame: MotionFrame | null = null
  private blendStartMs: number | null = null

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

  startBlend(from: MotionFrame) {
    this.fromFrame = from
    this.blendStartMs = performance.now()
  }

  pushFrame(frame: MotionFrame) {
    this.frames.push(frame)
  }

  get isPlaybackFinished(): boolean {
    if (!this.running || this.frames.length === 0 || this.startWallTimeMs === null) return false
    const t = (performance.now() - this.startWallTimeMs) / 1000
    return t > this.frames[this.frames.length - 1].timestamp
  }

  getFrameAtNow(): MotionFrame | null {
    if (!this.running || this.startWallTimeMs === null || this.frames.length === 0) return null
    const t = (performance.now() - this.startWallTimeMs) / 1000

    let lo = 0, hi = this.frames.length - 1, idx = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.frames[mid].timestamp <= t) { idx = mid; lo = mid + 1 }
      else hi = mid - 1
    }

    const result = idx >= 0 ? this.frames[idx] : this.frames[0]

    // interpolate between result and next frame
    const next = idx >= 0 && idx + 1 < this.frames.length ? this.frames[idx + 1] : null
    const interpolated = next
      ? blendFrames(result, next, (t - result.timestamp) / (next.timestamp - result.timestamp))
      : result

    if (idx > 1) this.frames.splice(0, idx - 1)

    if (this.fromFrame && this.blendStartMs !== null) {
      const bt = Math.min((performance.now() - this.blendStartMs) / 1000 / BLEND_DURATION, 1)
      if (bt >= 1) {
        this.fromFrame = null
        this.blendStartMs = null
      } else {
        return blendFrames(this.fromFrame, interpolated, bt)
      }
    }

    return interpolated
  }
}
