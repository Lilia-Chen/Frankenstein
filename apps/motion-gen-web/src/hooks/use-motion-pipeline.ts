import { useCallback, useRef, useState } from 'react'
import { MotionPlayer } from '../pipeline/player'
import { MocapSource } from '../pipeline/sources/mocap-source'
import { WebSocketSource, type WsStatus } from '../pipeline/sources/websocket-source'
import type { ConditioningSpec, GeneratorCapabilities } from '../types/motion'

export type SourceMode = 'websocket' | 'mocap'

export interface MotionPipelineState {
  mode: SourceMode
  wsStatus: WsStatus
  isGenerating: boolean
  error: string | null
  doneInfo: { total_frames: number; generation_time_ms: number; model_name: string } | null
  capabilities: GeneratorCapabilities | null
}

export interface MotionPipelineActions {
  setMode: (mode: SourceMode) => void
  connectWs: (url: string) => void
  disconnectWs: () => void
  generate: (conditioning: ConditioningSpec, opts?: { duration_seconds?: number; fps?: number }) => void
  cancel: () => void
  playMocap: (url: string) => void
  stopMocap: () => void
}

export function useMotionPipeline() {
  const playerRef = useRef(new MotionPlayer())
  const wsSourceRef = useRef<WebSocketSource | null>(null)
  const mocapSourceRef = useRef<MocapSource | null>(null)
  const requestIdRef = useRef<string | null>(null)

  const [state, setState] = useState<MotionPipelineState>({
    mode: 'websocket',
    wsStatus: 'idle',
    isGenerating: false,
    error: null,
    doneInfo: null,
    capabilities: null,
  })

  const patch = useCallback((partial: Partial<MotionPipelineState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const connectWs = useCallback((url: string) => {
    wsSourceRef.current?.dispose()
    const source = new WebSocketSource({
      url,
      onStatusChange: (wsStatus) => patch({ wsStatus }),
    })
    source.start({
      onFrame: (frame) => playerRef.current.pushFrame(frame),
      onDone: (doneInfo) => patch({ doneInfo, isGenerating: false }),
      onError: (error) => patch({ error, isGenerating: false }),
      onCapabilities: (capabilities) => patch({ capabilities }),
    })
    wsSourceRef.current = source
    patch({ error: null })
  }, [patch])

  const disconnectWs = useCallback(() => {
    wsSourceRef.current?.dispose()
    wsSourceRef.current = null
    patch({ wsStatus: 'idle' })
  }, [patch])

  const generate = useCallback((conditioning: ConditioningSpec, opts?: { duration_seconds?: number; fps?: number }) => {
    const ws = wsSourceRef.current
    if (!ws?.isConnected) {
      patch({ error: 'WebSocket is not connected.' })
      return
    }
    patch({ error: null, doneInfo: null, isGenerating: true })
    playerRef.current.reset()
    playerRef.current.start()
    const currentFrame = playerRef.current.getFrameAtNow() ?? undefined
    const id = ws.sendGenerate(conditioning, { ...opts, current_frame: currentFrame })
    requestIdRef.current = id
  }, [patch])

  const cancel = useCallback(() => {
    const id = requestIdRef.current
    if (!id) return
    wsSourceRef.current?.sendCancel(id)
    patch({ isGenerating: false })
  }, [patch])

  const playMocap = useCallback((url: string) => {
    mocapSourceRef.current?.dispose()
    const source = new MocapSource(url)
    playerRef.current.reset()
    playerRef.current.start()
    patch({ error: null, doneInfo: null, isGenerating: true })
    source.start({
      onFrame: (frame) => playerRef.current.pushFrame(frame),
      onDone: (doneInfo) => patch({ doneInfo, isGenerating: false }),
      onError: (error) => patch({ error, isGenerating: false }),
    })
    mocapSourceRef.current = source
  }, [patch])

  const stopMocap = useCallback(() => {
    mocapSourceRef.current?.dispose()
    mocapSourceRef.current = null
    playerRef.current.stop()
    patch({ isGenerating: false })
  }, [patch])

  const setMode = useCallback((mode: SourceMode) => {
    patch({ mode })
  }, [patch])

  const actions: MotionPipelineActions = {
    setMode,
    connectWs,
    disconnectWs,
    generate,
    cancel,
    playMocap,
    stopMocap,
  }

  return { player: playerRef.current, state, actions }
}
