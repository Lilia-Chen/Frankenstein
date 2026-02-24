import { useState } from 'react'
import type { MotionPipelineActions, MotionPipelineState, SourceMode } from '../hooks/use-motion-pipeline'
import { planFromText } from '../pipeline/layer1/planner'
import type { SkillPlan } from '../types/skill'

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
  const [planInput, setPlanInput] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('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')
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://openrouter.ai/api/v1/')
  const [llmModel, setLlmModel] = useState('gpt-4o-mini')
  const [isPlanning, setIsPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [lastPlan, setLastPlan] = useState<SkillPlan | null>(null)

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

  const handlePlanAndExecute = async () => {
    if (!planInput.trim()) return
    setIsPlanning(true)
    setPlanError(null)
    try {
      const plan = await planFromText(planInput.trim(), {
        apiKey: llmApiKey,
        baseURL: llmBaseUrl,
        model: llmModel,
      })
      setLastPlan(plan)
      actions.executePlan(plan)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsPlanning(false)
    }
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
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="llm-base-url">LLM URL</label>
            <input
              id="llm-base-url"
              className="control-panel__input"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
            />
            <label className="control-panel__label" htmlFor="llm-model">Model</label>
            <input
              id="llm-model"
              className="control-panel__input control-panel__input--small"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
            />
          </div>
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="llm-api-key">API Key</label>
            <input
              id="llm-api-key"
              className="control-panel__input"
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
            />
          </div>
          <div className="control-panel__row">
            <label className="control-panel__label" htmlFor="plan-input">Plan</label>
            <input
              id="plan-input"
              className="control-panel__input"
              placeholder="walk forward then wave then idle"
              value={planInput}
              onChange={(e) => setPlanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePlanAndExecute()}
            />
            <button
              className="control-panel__button control-panel__button--primary"
              onClick={handlePlanAndExecute}
              disabled={isPlanning || !planInput.trim()}
            >
              {isPlanning ? 'Planning…' : 'Plan & Execute'}
            </button>
            <button
              className="control-panel__button"
              onClick={actions.cancelPlan}
              disabled={!state.activePlan}
            >
              Cancel Plan
            </button>
          </div>
          {(lastPlan || state.activePlan) && (
            <div className="control-panel__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              {(state.activePlan ?? lastPlan)!.nodes.map((node) => {
                const isActive = state.activeNodeId === node.id
                const isDone = state.activePlan
                  ? !isActive && state.activePlan.nodes.indexOf(node) < state.activePlan.nodes.findIndex((n) => n.id === state.activeNodeId)
                  : true
                return (
                  <span key={node.id} style={{ opacity: isDone ? 0.4 : 1, fontWeight: isActive ? 'bold' : 'normal' }}>
                    {isActive ? '▶ ' : isDone ? '✓ ' : '○ '}{node.skill}: {node.params.text}
                  </span>
                )
              })}
            </div>
          )}
          {planError && <div className="control-panel__row"><span className="control-panel__error">{planError}</span></div>}
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
