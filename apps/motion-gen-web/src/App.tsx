import { initAmmo } from '@moeru/three-mmd-physics-ammo'
import { SetupPhysics } from '@moeru/three-mmd-r3f'
import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Leva } from 'leva'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Viewer from './components/Viewer'
import { MotionPlayer } from './motion/player'
import { MotionWebSocketClient, type WsClientStatus } from './motion/ws-client'
import type { DoneMessage } from './types/motion'

export default function App() {
  const playerRef = useRef(new MotionPlayer())
  const socketRef = useRef<MotionWebSocketClient | null>(null)
  const requestIdRef = useRef<string | null>(null)

  const [wsUrl, setWsUrl] = useState('ws://localhost:8000/ws/motion')
  const [prompt, setPrompt] = useState('walk forward')
  const [durationSeconds, setDurationSeconds] = useState('3')
  const [fps, setFps] = useState('30')
  const [status, setStatus] = useState<WsClientStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [doneInfo, setDoneInfo] = useState<DoneMessage['metadata'] | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const client = useMemo(
    () =>
      new MotionWebSocketClient({
        url: wsUrl,
        onStatusChange: (next) => setStatus(next),
        onFrame: (message) => {
          playerRef.current.pushFrame(message.frame)
        },
        onDone: (message) => {
          setDoneInfo(message.metadata)
          setIsGenerating(false)
        },
        onError: (message) => {
          setError(message)
          setIsGenerating(false)
        },
      }),
    [wsUrl],
  )

  useEffect(() => {
    socketRef.current = client
    client.connect()
    return () => {
      client.close()
      socketRef.current = null
    }
  }, [client])

  const connectSocket = () => {
    setError(null)
    client.connect()
  }

  const disconnectSocket = () => {
    client.close()
  }

  const handleGenerate = () => {
    if (!prompt.trim()) {
      setError('Please enter a motion prompt.')
      return
    }
    const id = crypto.randomUUID()
    requestIdRef.current = id
    setError(null)
    setDoneInfo(null)
    setIsGenerating(true)
    playerRef.current.reset()
    playerRef.current.start()
    const currentFrame = playerRef.current.getFrameAtNow()
    client.sendGenerate({
      type: 'generate',
      id,
      payload: {
        text_prompt: prompt.trim(),
        duration_seconds: durationSeconds ? Number(durationSeconds) : undefined,
        fps: fps ? Number(fps) : undefined,
        current_frame: currentFrame ?? undefined,
      },
    })
  }

  const handleCancel = () => {
    const id = requestIdRef.current
    if (!id) return
    setIsGenerating(false)
    client.sendCancel({ type: 'cancel', id })
  }

  return (
    <>
      <Canvas
        camera={{ position: [0, 15, 50], fov: 45 }}
        gl={{ localClippingEnabled: true }}
        style={{ height: '100dvh', touchAction: 'none', width: '100dvw' }}
      >
        <Suspense>
          <SetupPhysics setup={initAmmo}>
            <Viewer player={playerRef.current} />
            <OrbitControls target={[0, 10, 0]} />
            <ambientLight intensity={1.5} />
            <directionalLight intensity={1.64} position={[2.1, 0, 24]} rotation={[0, 2 * Math.PI, 0]} />
            <Environment background files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/belfast_sunset_puresky_2k.hdr" />
          </SetupPhysics>
        </Suspense>
      </Canvas>
      <div className="motion-panel">
        <div className="motion-panel__row">
          <label className="motion-panel__label" htmlFor="ws-url">WebSocket</label>
          <input
            id="ws-url"
            className="motion-panel__input"
            value={wsUrl}
            onChange={(event) => setWsUrl(event.target.value)}
          />
          <button className="motion-panel__button" onClick={connectSocket}>Connect</button>
          <button className="motion-panel__button" onClick={disconnectSocket}>Disconnect</button>
        </div>
        <div className="motion-panel__row">
          <label className="motion-panel__label" htmlFor="prompt">Prompt</label>
          <input
            id="prompt"
            className="motion-panel__input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <div className="motion-panel__row">
          <label className="motion-panel__label" htmlFor="duration">Duration (s)</label>
          <input
            id="duration"
            className="motion-panel__input motion-panel__input--small"
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(event.target.value)}
          />
          <label className="motion-panel__label" htmlFor="fps">FPS</label>
          <input
            id="fps"
            className="motion-panel__input motion-panel__input--small"
            value={fps}
            onChange={(event) => setFps(event.target.value)}
          />
          <button className="motion-panel__button motion-panel__button--primary" onClick={handleGenerate}>
            Generate
          </button>
          <button className="motion-panel__button" onClick={handleCancel} disabled={!isGenerating}>
            Cancel
          </button>
        </div>
        <div className="motion-panel__row motion-panel__status">
          <span>Status: {status}</span>
          {isGenerating && <span>Generating…</span>}
          {doneInfo && (
            <span>
              Done: {doneInfo.total_frames} frames, {doneInfo.generation_time_ms}ms ({doneInfo.model_name})
            </span>
          )}
          {error && <span className="motion-panel__error">{error}</span>}
        </div>
      </div>
      <Leva titleBar={{ title: 'MMD Controls' }} />
    </>
  )
}
