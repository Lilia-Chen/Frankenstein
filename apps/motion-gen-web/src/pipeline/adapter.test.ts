import { describe, expect, it, vi } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import type { MotionFrame } from '../types/motion'
import { SMPLX_TO_VRM } from '../types/vrm'
import {
  applyMotionFrameToVrm,
  createVrmBoneMap,
  readVrmToMotionFrame,
  type VrmBoneMap,
} from './adapter'

/** Create a real Object3D to use as a bone node. */
function makeBone(): Object3D {
  return new Object3D()
}

/** Build a minimal VrmBoneMap for testing. */
function makeBoneMap(opts?: { noRoot?: boolean }): VrmBoneMap {
  const root = opts?.noRoot ? null : makeBone()
  return {
    root,
    joints: {
      pelvis: root ?? makeBone(),
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

describe('applyMotionFrameToVrm', () => {
  it('writes root position', () => {
    const boneMap = makeBoneMap()
    const frame = makeFrame({ root_position: [1, 2, 3] })
    applyMotionFrameToVrm(frame, boneMap)
    const p = boneMap.root!.position
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3])
  })

  it('writes root rotation', () => {
    const boneMap = makeBoneMap()
    const frame = makeFrame({ root_rotation: [0, 0.707, 0, 0.707] })
    applyMotionFrameToVrm(frame, boneMap)
    const q = boneMap.root!.quaternion
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(0.707)
    expect(q.z).toBeCloseTo(0)
    expect(q.w).toBeCloseTo(0.707)
  })

  it('writes joint rotations to correct bones', () => {
    const boneMap = makeBoneMap()
    const frame = makeFrame({
      joint_rotations: {
        left_shoulder: [0.1, 0.2, 0.3, 0.9],
        right_shoulder: [0.4, 0.5, 0.6, 0.7],
      },
    })
    applyMotionFrameToVrm(frame, boneMap)

    const lq = boneMap.joints.left_shoulder!.quaternion
    expect(lq.x).toBeCloseTo(0.1)
    expect(lq.y).toBeCloseTo(0.2)
    expect(lq.z).toBeCloseTo(0.3)
    expect(lq.w).toBeCloseTo(0.9)

    const rq = boneMap.joints.right_shoulder!.quaternion
    expect(rq.x).toBeCloseTo(0.4)
    expect(rq.y).toBeCloseTo(0.5)
    expect(rq.z).toBeCloseTo(0.6)
    expect(rq.w).toBeCloseTo(0.7)
  })

  it('skips joints not in boneMap gracefully', () => {
    const boneMap = makeBoneMap()
    const frame = makeFrame({
      joint_rotations: {
        head: [0.1, 0.2, 0.3, 0.9], // not in our test boneMap
      },
    })
    // Should not throw
    expect(() => applyMotionFrameToVrm(frame, boneMap)).not.toThrow()
  })

  it('handles null root gracefully', () => {
    const boneMap = makeBoneMap({ noRoot: true })
    const frame = makeFrame({ root_position: [5, 5, 5] })
    expect(() => applyMotionFrameToVrm(frame, boneMap)).not.toThrow()
  })

  it('stabilizes quaternion sign flip', () => {
    const boneMap = makeBoneMap()

    // First frame: positive hemisphere
    applyMotionFrameToVrm(
      makeFrame({ root_rotation: [0, 0, 0, 1] }),
      boneMap,
    )
    expect(boneMap.root!.quaternion.w).toBeCloseTo(1)

    // Second frame: same rotation but negated (equivalent quaternion)
    // stabilize should flip it back to positive hemisphere
    applyMotionFrameToVrm(
      makeFrame({ root_rotation: [0, 0, 0, -1] }),
      boneMap,
    )
    // After stabilization, should be negated back to [0,0,0,1]
    expect(boneMap.root!.quaternion.w).toBeCloseTo(1)
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
    expect(frame.joint_rotations.left_shoulder).toBeDefined()
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
  it('maps SMPL-X joints to VRM bones', () => {
    const bones = new Map<string, Object3D>()
    // Create a bone for each VRM name
    for (const vrmName of Object.values(SMPLX_TO_VRM)) {
      bones.set(vrmName, makeBone())
    }

    const mockVrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn((name: string) => bones.get(name) ?? null),
      },
    }

    const boneMap = createVrmBoneMap(mockVrm as any)

    // root should be the hips bone
    expect(boneMap.root).toBe(bones.get('hips'))

    // All 22 joints should be mapped
    for (const [joint, vrmName] of Object.entries(SMPLX_TO_VRM)) {
      expect(boneMap.joints[joint as keyof typeof boneMap.joints]).toBe(bones.get(vrmName))
    }
  })

  it('skips optional bones that return null', () => {
    const mockVrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn((name: string) => {
          // Only return hips, skip everything else (simulating missing optional bones)
          if (name === 'hips') return makeBone()
          return null
        }),
      },
    }

    const boneMap = createVrmBoneMap(mockVrm as any)
    expect(boneMap.root).toBeTruthy()
    // chest/upperChest etc should not be in joints
    expect(boneMap.joints.spine2).toBeUndefined()
    expect(boneMap.joints.spine3).toBeUndefined()
  })
})
