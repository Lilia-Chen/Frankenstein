import { useCallback, useRef, useState } from 'react'
import { MotionPlayer } from '../pipeline/player'
import { MocapSource } from '../pipeline/sources/mocap-source'
import { WebSocketSource, type WsStatus } from '../pipeline/sources/websocket-source'
import type { ConditioningSpec, GeneratorCapabilities, MotionFrame } from '../types/motion'

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
  sendStateUpdate: (frame: MotionFrame) => void
  setAutoIdle: (enabled: boolean, conditioning?: ConditioningSpec) => void
}

export function useMotionPipeline() {
  const playerRef = useRef(new MotionPlayer())
  const wsSourceRef = useRef<WebSocketSource | null>(null)
  const mocapSourceRef = useRef<MocapSource | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const autoIdleRef = useRef(false)
  const autoIdleConditioningRef = useRef<ConditioningSpec>({ text: 'idle' })
  const pendingResetRef = useRef(false)

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
      onFrame: (frame, id) => {
        if (id && id !== requestIdRef.current) return
        if (pendingResetRef.current) {
          const from = playerRef.current.getFrameAtNow()
          playerRef.current.reset()
          playerRef.current.start()
          if (from) playerRef.current.startBlend(from)
          pendingResetRef.current = false
        }
        playerRef.current.pushFrame(frame)
      },
      onDone: (doneInfo, doneId) => {
        if (doneId && doneId !== requestIdRef.current) return
        patch({ doneInfo, isGenerating: false })
        if (autoIdleRef.current && wsSourceRef.current?.isConnected) {
          const ws = wsSourceRef.current
          patch({ error: null, doneInfo: null, isGenerating: true })
          const currentFrame = playerRef.current.getFrameAtNow() ?? undefined
          playerRef.current.reset()
          playerRef.current.start()
          if (currentFrame) playerRef.current.startBlend(currentFrame)
          pendingResetRef.current = false
          const id = ws.sendGenerate(autoIdleConditioningRef.current, { current_frame: currentFrame })
          requestIdRef.current = id
        }
      },
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
    // cancel previous request to stop stale frames
    const prevId = requestIdRef.current
    if (prevId) ws.sendCancel(prevId)

    patch({ error: null, doneInfo: null, isGenerating: true })
    const currentFrame = playerRef.current.getFrameAtNow() ?? undefined
    pendingResetRef.current = true
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

  const sendStateUpdate = useCallback((frame: MotionFrame) => {
    wsSourceRef.current?.sendStateUpdate(frame)
  }, [])

  const setAutoIdle = useCallback((enabled: boolean, conditioning?: ConditioningSpec) => {
    autoIdleRef.current = enabled
    if (conditioning) autoIdleConditioningRef.current = conditioning
  }, [])

  const actions: MotionPipelineActions = {
    setMode,
    connectWs,
    disconnectWs,
    generate,
    cancel,
    playMocap,
    stopMocap,
    sendStateUpdate,
    setAutoIdle,
  }

  return { player: playerRef.current, state, actions }
}
