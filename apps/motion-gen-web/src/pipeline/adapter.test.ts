import { describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'
import type { MotionFrame } from '../types/motion'
import { SMPLX_TO_VRM } from '../types/vrm'
import {
  applyMotionFrameToVrm,
  applyMotionFrameFromDart,
  createVrmBoneMap,
  readVrmToMotionFrame,
  type VrmBoneMap,
} from './adapter'

function makeBone(): Object3D {
  return new Object3D()
}

function makeBoneMap(opts?: { noRoot?: boolean }): VrmBoneMap {
  const root = opts?.noRoot ? null : makeBone()
  return {
    root,
    joints: {
      left_shoulder: makeBone(),
      right_shoulder: makeBone(),
    },
  }
}

function makeFrame(overrides?: Partial<MotionFrame>): MotionFrame {
  return {
    timestamp: 0,
    root_position: [0, 0, 0],
    root_rotation: [0, 0, 0, 1],
    joint_rotations: {},
    ...overrides,
  }
}

/**
 * applyMotionFrameToVrm — direct pass-through (no coord conversion).
 * For backends that already send Y-up data (e.g. motionStream).
 */
describe('applyMotionFrameToVrm (direct / Y-up)', () => {
  it('passes root position through unchanged', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameToVrm(makeFrame({ root_position: [1, 2, 3] }), boneMap)
    const p = boneMap.root!.position
    expect(p.x).toBeCloseTo(1)
    expect(p.y).toBeCloseTo(2)
    expect(p.z).toBeCloseTo(3)
  })

  it('identity root rotation stays identity', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameToVrm(makeFrame({ root_rotation: [0, 0, 0, 1] }), boneMap)
    const q = boneMap.root!.quaternion
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(0)
    expect(q.z).toBeCloseTo(0)
    expect(q.w).toBeCloseTo(1)
  })

  it('joint rotations pass through unchanged', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameToVrm(makeFrame({
      joint_rotations: { left_shoulder: [0.1, 0.2, 0.3, 0.9] },
    }), boneMap)
    const q = boneMap.joints.left_shoulder!.quaternion
    expect(q.x).toBeCloseTo(0.1)
    expect(q.y).toBeCloseTo(0.2)
    expect(q.z).toBeCloseTo(0.3)
    expect(q.w).toBeCloseTo(0.9)
  })

  it('skips joints not in boneMap gracefully', () => {
    const boneMap = makeBoneMap()
    expect(() => applyMotionFrameToVrm(makeFrame({ joint_rotations: { head: [0.1, 0.2, 0.3, 0.9] } }), boneMap)).not.toThrow()
  })

  it('handles null root gracefully', () => {
    const boneMap = makeBoneMap({ noRoot: true })
    expect(() => applyMotionFrameToVrm(makeFrame({ root_position: [5, 5, 5] }), boneMap)).not.toThrow()
  })

  it('stabilizes quaternion sign flip on root', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameToVrm(makeFrame({ root_rotation: [0, 0, 0, 1] }), boneMap)
    const w1 = boneMap.root!.quaternion.w
    applyMotionFrameToVrm(makeFrame({ root_rotation: [0, 0, 0, -1] }), boneMap)
    expect(boneMap.root!.quaternion.w).toBeCloseTo(w1)
  })
})

/**
 * applyMotionFrameFromDart — DART backend Z-up → Y-up conversion.
 * R = Ry(180°) * Rx(-90°). Position: [x,y,z] → [-x, z, y].
 */
describe('applyMotionFrameFromDart (DART / Z-up)', () => {
  it('converts root position: [x,y,z] → [-x, z, y]', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameFromDart(makeFrame({ root_position: [1, 2, 3] }), boneMap)
    const p = boneMap.root!.position
    expect(p.x).toBeCloseTo(-1)
    expect(p.y).toBeCloseTo(3)
    expect(p.z).toBeCloseTo(2)
  })

  it('identity root rotation becomes R (standing up in Y-up)', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameFromDart(makeFrame({ root_rotation: [0, 0, 0, 1] }), boneMap)
    const q = boneMap.root!.quaternion
    // R = Ry(180°) * Rx(-90°) = [0, √2/2, √2/2, 0]
    const s = Math.SQRT1_2
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(s)
    expect(q.z).toBeCloseTo(s)
    expect(q.w).toBeCloseTo(0)
  })

  it('joint rotations pass through unchanged', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameFromDart(makeFrame({
      joint_rotations: { left_shoulder: [0.1, 0.2, 0.3, 0.9] },
    }), boneMap)
    const q = boneMap.joints.left_shoulder!.quaternion
    expect(q.x).toBeCloseTo(0.1)
    expect(q.y).toBeCloseTo(0.2)
    expect(q.z).toBeCloseTo(0.3)
    expect(q.w).toBeCloseTo(0.9)
  })

  it('pelvis in joint_rotations is skipped (does not overwrite root)', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameFromDart(makeFrame({
      root_rotation: [0, 0, 0, 1],
      joint_rotations: { pelvis: [0.5, 0.5, 0.5, 0.5] },
    }), boneMap)
    const q = boneMap.root!.quaternion
    const s = Math.SQRT1_2
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(s)
    expect(q.z).toBeCloseTo(s)
    expect(q.w).toBeCloseTo(0)
  })

  it('handles null root gracefully', () => {
    const boneMap = makeBoneMap({ noRoot: true })
    expect(() => applyMotionFrameFromDart(makeFrame({ root_position: [5, 5, 5] }), boneMap)).not.toThrow()
  })

  it('stabilizes quaternion sign flip on root', () => {
    const boneMap = makeBoneMap()
    applyMotionFrameFromDart(makeFrame({ root_rotation: [0, 0, 0, 1] }), boneMap)
    const w1 = boneMap.root!.quaternion.w
    applyMotionFrameFromDart(makeFrame({ root_rotation: [0, 0, 0, -1] }), boneMap)
    expect(boneMap.root!.quaternion.w).toBeCloseTo(w1)
  })
})

describe('readVrmToMotionFrame', () => {
  it('reads root position and rotation', () => {
    const boneMap = makeBoneMap()
    boneMap.root!.position.set(1, 2, 3)
    boneMap.root!.quaternion.set(0, 0.707, 0, 0.707)
    const frame = readVrmToMotionFrame(boneMap, 1.5)
    expect(frame.timestamp).toBe(1.5)
    expect(frame.root_position).toEqual([1, 2, 3])
    expect(frame.root_rotation[1]).toBeCloseTo(0.707)
  })

  it('reads joint rotations', () => {
    const boneMap = makeBoneMap()
    boneMap.joints.left_shoulder!.quaternion.set(0.1, 0.2, 0.3, 0.9)
    const frame = readVrmToMotionFrame(boneMap, 0)
    const [x, y, z, w] = frame.joint_rotations.left_shoulder!
    expect(x).toBeCloseTo(0.1)
    expect(y).toBeCloseTo(0.2)
    expect(z).toBeCloseTo(0.3)
    expect(w).toBeCloseTo(0.9)
  })

  it('returns defaults when root is null', () => {
    const boneMap = makeBoneMap({ noRoot: true })
    const frame = readVrmToMotionFrame(boneMap, 0)
    expect(frame.root_position).toEqual([0, 0, 0])
    expect(frame.root_rotation).toEqual([0, 0, 0, 1])
  })
})

describe('createVrmBoneMap', () => {
  it('maps SMPL-X joints to VRM bones (excluding pelvis)', () => {
    const bones = new Map<string, Object3D>()
    for (const vrmName of Object.values(SMPLX_TO_VRM)) {
      bones.set(vrmName, makeBone())
    }
    const mockVrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn((name: string) => bones.get(name) ?? null),
      },
    }
    const boneMap = createVrmBoneMap(mockVrm as any)
    expect(boneMap.root).toBe(bones.get('hips'))
    // pelvis should NOT be in joints
    expect(boneMap.joints.pelvis).toBeUndefined()
    // other joints should be mapped
    expect(boneMap.joints.spine1).toBe(bones.get('spine'))
    expect(boneMap.joints.left_shoulder).toBe(bones.get('leftUpperArm'))
  })

  it('skips optional bones that return null', () => {
    const mockVrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn((name: string) => {
          if (name === 'hips') return makeBone()
          return null
        }),
      },
    }
    const boneMap = createVrmBoneMap(mockVrm as any)
    expect(boneMap.root).toBeTruthy()
    expect(boneMap.joints.spine2).toBeUndefined()
  })
})
