import { Leva } from 'leva'
import { Suspense } from 'react'
import ControlPanel from './components/ControlPanel'
import Scene from './components/Scene'
import VrmViewer from './components/VrmViewer'
import { useMotionPipeline } from './hooks/use-motion-pipeline'

// const MODEL_URL = '/assets/VRM1_Constraint_Twist_Sample.vrm'
const MODEL_URL = '/assets/lapwing.vrm'

export default function App() {
  const { player, state, actions } = useMotionPipeline()

  return (
    <>
      <Scene>
        <Suspense>
          <VrmViewer modelUrl={MODEL_URL} player={player} />
        </Suspense>
      </Scene>
      <ControlPanel state={state} actions={actions} />
      <Leva titleBar={{ title: 'Debug' }} />
    </>
  )
}
