import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MotionFrame } from '../types/motion'
import { MotionPlayer } from './player'

function makeFrame(timestamp: number): MotionFrame {
  return {
    timestamp,
    root_position: [0, 0, 0],
    root_rotation: [0, 0, 0, 1],
    joint_rotations: {},
  }
}

describe('MotionPlayer', () => {
  let player: MotionPlayer

  beforeEach(() => {
    player = new MotionPlayer()
  })

  describe('initial state', () => {
    it('has zero frames', () => {
      expect(player.frameCount).toBe(0)
    })

    it('is not running', () => {
      expect(player.isRunning).toBe(false)
    })

    it('returns null from getFrameAtNow', () => {
      expect(player.getFrameAtNow()).toBeNull()
    })
  })

  describe('pushFrame', () => {
    it('increments frameCount', () => {
      player.pushFrame(makeFrame(0))
      expect(player.frameCount).toBe(1)
      player.pushFrame(makeFrame(0.033))
      expect(player.frameCount).toBe(2)
    })
  })

  describe('start / stop', () => {
    it('sets isRunning to true on start', () => {
      player.start()
      expect(player.isRunning).toBe(true)
    })

    it('sets isRunning to false on stop', () => {
      player.start()
      player.stop()
      expect(player.isRunning).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all frames', () => {
      player.pushFrame(makeFrame(0))
      player.pushFrame(makeFrame(0.033))
      player.reset()
      expect(player.frameCount).toBe(0)
    })

    it('returns null after reset when not running', () => {
      player.pushFrame(makeFrame(0))
      player.start()
      player.reset()
      player.stop()
      expect(player.getFrameAtNow()).toBeNull()
    })
  })

  describe('getFrameAtNow', () => {
    let mockNow: number

    beforeEach(() => {
      mockNow = 1000
      vi.spyOn(performance, 'now').mockImplementation(() => mockNow)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns null when not started', () => {
      player.pushFrame(makeFrame(0))
      expect(player.getFrameAtNow()).toBeNull()
    })

    it('returns null when no frames', () => {
      player.start()
      expect(player.getFrameAtNow()).toBeNull()
    })

    it('returns the only frame when elapsed >= its timestamp', () => {
      player.pushFrame(makeFrame(0))
      player.start() // records startWallTimeMs = 1000
      mockNow = 1000 // elapsed = 0s
      expect(player.getFrameAtNow()).toEqual(makeFrame(0))
    })

    it('returns first frame when elapsed is before first timestamp', () => {
      player.pushFrame(makeFrame(0.5))
      player.pushFrame(makeFrame(1.0))
      player.start() // startWallTimeMs = 1000
      mockNow = 1000 // elapsed = 0s, before 0.5
      expect(player.getFrameAtNow()).toEqual(makeFrame(0.5))
    })

    it('returns correct frame based on elapsed time', () => {
      const f0 = makeFrame(0)
      const f1 = makeFrame(0.5)
      const f2 = makeFrame(1.0)
      player.pushFrame(f0)
      player.pushFrame(f1)
      player.pushFrame(f2)
      player.start() // startWallTimeMs = 1000

      mockNow = 1000 // elapsed = 0s
      expect(player.getFrameAtNow()).toEqual(f0)

      mockNow = 1600 // elapsed = 0.6s → f1
      expect(player.getFrameAtNow()).toEqual(f1)

      mockNow = 2000 // elapsed = 1.0s → f2
      expect(player.getFrameAtNow()).toEqual(f2)
    })

    it('returns last frame when elapsed exceeds all timestamps', () => {
      const f0 = makeFrame(0)
      const f1 = makeFrame(0.5)
      player.pushFrame(f0)
      player.pushFrame(f1)
      player.start() // startWallTimeMs = 1000

      mockNow = 5000 // elapsed = 4s, way past 0.5
      expect(player.getFrameAtNow()).toEqual(f1)
    })

    it('resets timing on reset while running', () => {
      player.pushFrame(makeFrame(0))
      player.pushFrame(makeFrame(1.0))
      player.start() // startWallTimeMs = 1000

      mockNow = 2500 // elapsed = 1.5s
      player.reset() // resets startWallTimeMs to 2500, clears frames

      player.pushFrame(makeFrame(0))
      player.pushFrame(makeFrame(0.5))

      mockNow = 2800 // elapsed from reset = 0.3s
      expect(player.getFrameAtNow()).toEqual(makeFrame(0))

      mockNow = 3100 // elapsed from reset = 0.6s
      expect(player.getFrameAtNow()).toEqual(makeFrame(0.5))
    })
  })
})
