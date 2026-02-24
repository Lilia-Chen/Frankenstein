import type {
  CancelRequest,
  ConditioningSpec,
  GenerateRequest,
  MotionFrame,
  ServerMessage,
  StateUpdateMessage,
} from '../../types/motion'
import type { MotionSource, MotionSourceCallbacks } from './types'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface WebSocketSourceOptions {
  url: string
  onStatusChange?: (status: WsStatus) => void
}

export class WebSocketSource implements MotionSource {
  private worker: Worker | null = null
  private callbacks: MotionSourceCallbacks | null = null
  private readonly options: WebSocketSourceOptions
  private status: WsStatus = 'idle'

  constructor(options: WebSocketSourceOptions) {
    this.options = options
  }

  start(callbacks: MotionSourceCallbacks) {
    this.callbacks = callbacks
    this.connect()
  }

  stop() {
    this.close()
  }

  dispose() {
    this.close()
    this.worker?.terminate()
    this.worker = null
    this.callbacks = null
  }

  connect() {
    if (!this.options.url) {
      this.callbacks?.onError('WebSocket URL is empty.')
      this.setStatus('error')
      return
    }
    if (this.status === 'open') return

    if (!this.worker) {
      this.worker = new Worker(new URL('./websocket.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data)
    }

    this.worker.postMessage({ type: 'connect', url: this.options.url })
  }

  close() {
    this.worker?.postMessage({ type: 'disconnect' })
  }

  private handleWorkerMessage(data: { type: 'status'; status: WsStatus } | { type: 'message'; msg: ServerMessage }) {
    if (data.type === 'status') {
      this.status = data.status
      if (data.status === 'error') {
        this.callbacks?.onError('Unable to connect to WebSocket backend.')
      }
      this.setStatus(data.status)
      return
    }

    const msg = data.msg
    switch (msg.type) {
      case 'frame':
        this.callbacks?.onFrame(msg.frame, msg.id)
        break
      case 'done':
        this.callbacks?.onDone(msg.metadata, msg.id)
        break
      case 'error':
        this.callbacks?.onError(msg.error)
        break
      case 'handshake':
        this.callbacks?.onCapabilities?.(msg.capabilities)
        break
    }
  }

  sendGenerate(conditioning: ConditioningSpec, opts?: { duration_seconds?: number; fps?: number; current_frame?: MotionFrame }) {
    const req: GenerateRequest = {
      type: 'generate',
      id: crypto.randomUUID(),
      payload: { conditioning, ...opts },
    }
    this.send(req)
    return req.id
  }

  sendCancel(id: string) {
    const req: CancelRequest = { type: 'cancel', id }
    this.send(req)
  }

  sendStateUpdate(frame: MotionFrame) {
    if (this.status !== 'open') return
    const msg: StateUpdateMessage = { type: 'state_update', frame }
    this.worker?.postMessage({ type: 'send', data: JSON.stringify(msg) })
  }

  get isConnected(): boolean {
    return this.status === 'open'
  }

  private send(payload: object) {
    if (this.status !== 'open') {
      this.callbacks?.onError('WebSocket is not connected.')
      return
    }
    this.worker?.postMessage({ type: 'send', data: JSON.stringify(payload) })
  }

  private setStatus(status: WsStatus) {
    this.options.onStatusChange?.(status)
  }
}
