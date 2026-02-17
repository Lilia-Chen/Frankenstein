declare module '@moeru/three-mmd' {
  import type { Bone, Quaternion, SkinnedMesh } from 'three'
  import type { IK } from 'three/examples/jsm/animation/CCDIKSolver.js'

  export interface Grant {
    affectPosition: boolean
    affectRotation: boolean
    index: number
    isLocal: boolean
    parentIndex: number
    ratio: number
  }

  export class GrantSolver {
    grants: Grant[]
    mesh: SkinnedMesh
    constructor(mesh: SkinnedMesh, grants?: Grant[])
    addGrantRotation(bone: Bone, q: Quaternion, ratio: number): this
    update(): this
    updateOne(grant: Grant): this
  }

  export class MMD {
    grants: Grant[]
    iks: IK[]
    mesh: SkinnedMesh
    scale: number
    createHelper<T>(): T | undefined
    setPhysics<T>(createPhysics: PhysicsFactory<T>): void
    setScalar(scale: number): void
    update(delta: number): void
  }

  export type PhysicsFactory<T> = (mmd: MMD) => PhysicsService<T>
  export interface PhysicsService<T = unknown> {
    createHelper?: () => T
    dispose?: () => void
    setScalar?: (scale: number) => void
    update: (delta: number) => void
  }
}
