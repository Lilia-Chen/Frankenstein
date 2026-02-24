import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import type { VRM } from '@pixiv/three-vrm'
import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function useVRM(url: string): VRM {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser, {
      springBonePlugin: { name: 'noop', afterRoot: async () => {} } as any,
    }))
  })

  const vrm = useMemo(() => {
    const v = gltf.userData.vrm as VRM
    v.scene.traverse((obj) => {
      obj.frustumCulled = false
    })
    return v
  }, [gltf])

  return vrm
}
