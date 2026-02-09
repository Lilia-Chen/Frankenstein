import { VMDLoader } from '@moeru/three-mmd'
import { useLoader } from '@react-three/fiber'

const useVMD = (path: string) => useLoader(VMDLoader, path)

useVMD.preload = (path: string) =>
  useLoader.preload(VMDLoader, path)

useVMD.clear = (path: string) =>
  useLoader.clear(VMDLoader, path)

export { useVMD }
