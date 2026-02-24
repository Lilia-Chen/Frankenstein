import { useState } from 'react'
import type { MotionPipelineActions, MotionPipelineState, SourceMode } from '../hooks/use-motion-pipeline'

interface ControlPanelProps {
  state: MotionPipelineState
  actions: MotionPipelineActions
}

export default function ControlPanel({ state, actions }: ControlPanelProps) {
  const [wsUrl, setWsUrl] = useState('ws://localhost:8000/ws/motion')
  const [prompt, setPrompt] = useState('walk forward')
  const [durationSeconds, setDurationSeconds] = useState('5')
  const [fps, setFps] = useState('30')
  const [mocapUrl, setMocapUrl] = useState('')
  const [autoIdle, setAutoIdle] = useState(false)
  const [idlePrompt, setIdlePrompt] = useState('idle')

  const handleModeChange = (mode: SourceMode) => {
    actions.setMode(mode)
  }

  const handleGenerate = () => {
    if (!prompt.trim()) return
    actions.generate(
      { text: prompt.trim() },
      {
        duration_seconds: durationSeconds ? Number(durationSeconds) : undefined,
        fps: fps ? Number(fps) : undefined,
      },
    )
  }

  return (
    <div className="control-panel">
      <div className="control-panel__row">
        <button
          className={`control-panel__tab ${state.mode === 'websocket' ? 'control-panel__tab--active' : ''}`}
          onClick={() => handleModeChange('websocket')}
        >
          WebSocket
        </button>
        <button
          className={`control-panel__tab ${state.mode === 'mocap' ? 'control-panel__tab--active' : ''}`}
          onClick={() => handleModeChange('mocap')}
        >
          Mocap
        </button>
      </div>

      {state.mode === 'websocket' && (
        <>
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="ws-url">URL</label>
            <input
              id="ws-url"
              className="control-panel__input"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
            />
            <button className="control-panel__button" onClick={() => actions.connectWs(wsUrl)}>
              Connect
            </button>
            <button className="control-panel__button" onClick={actions.disconnectWs}>
              Disconnect
            </button>
          </div>
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="prompt">Prompt</label>
            <input
              id="prompt"
              className="control-panel__input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
          </div>
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="duration">Duration</label>
            <input
              id="duration"
              className="control-panel__input control-panel__input--small"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
            />
            <label className="control-panel__label" htmlFor="fps">FPS</label>
            <input
              id="fps"
              className="control-panel__input control-panel__input--small"
              value={fps}
              onChange={(e) => setFps(e.target.value)}
            />
            <button className="control-panel__button control-panel__button--primary" onClick={handleGenerate}>
              Generate
            </button>
            <button className="control-panel__button" onClick={actions.cancel} disabled={!state.isGenerating}>
              Cancel
            </button>
          </div>
          <div className="control-panel__row">
            <input
              id="auto-idle"
              type="checkbox"
              checked={autoIdle}
              onChange={(e) => {
                setAutoIdle(e.target.checked)
                actions.setAutoIdle(e.target.checked, { text: idlePrompt })
              }}
            />
            <label className="control-panel__label" htmlFor="auto-idle">Auto Idle</label>
            <input
              className="control-panel__input"
              value={idlePrompt}
              onChange={(e) => {
                setIdlePrompt(e.target.value)
                actions.setAutoIdle(autoIdle, { text: e.target.value })
              }}
            />
          </div>
        </>
      )}

      {state.mode === 'mocap' && (
        <div className="control-panel__row">
          <label className="control-panel__label" htmlFor="mocap-url">JSON URL</label>
          <input
            id="mocap-url"
            className="control-panel__input"
            placeholder="/assets/mocap.json"
            value={mocapUrl}
            onChange={(e) => setMocapUrl(e.target.value)}
          />
          <button
            className="control-panel__button control-panel__button--primary"
            onClick={() => actions.playMocap(mocapUrl)}
            disabled={!mocapUrl}
          >
            Play
          </button>
          <button className="control-panel__button" onClick={actions.stopMocap} disabled={!state.isGenerating}>
            Stop
          </button>
        </div>
      )}

      <div className="control-panel__row control-panel__status">
        {state.mode === 'websocket' && <span>WS: {state.wsStatus}</span>}
        {state.isGenerating && <span>Generating…</span>}
        {state.doneInfo && (
          <span>
            {state.doneInfo.total_frames} frames, {state.doneInfo.generation_time_ms}ms ({state.doneInfo.model_name})
          </span>
        )}
        {state.error && <span className="control-panel__error">{state.error}</span>}
      </div>
    </div>
  )
}
