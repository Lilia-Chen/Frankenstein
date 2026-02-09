import { MMDMeshLoader } from '@moeru/three-mmd'
import { useLoader } from '@react-three/fiber'

const useMMDMesh = (path: string) => useLoader(MMDMeshLoader, path)

useMMDMesh.preload = (path: string) =>
  useLoader.preload(MMDMeshLoader, path)

useMMDMesh.clear = (path: string) =>
  useLoader.clear(MMDMeshLoader, path)

export { useMMDMesh }
