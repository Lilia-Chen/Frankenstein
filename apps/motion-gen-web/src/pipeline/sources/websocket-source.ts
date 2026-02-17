import type {
  CancelRequest,
  ConditioningSpec,
  GenerateRequest,
  MotionFrame,
  ServerMessage,
} from '../../types/motion'
import type { MotionSource, MotionSourceCallbacks } from './types'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface WebSocketSourceOptions {
  url: string
  onStatusChange?: (status: WsStatus) => void
}

export class WebSocketSource implements MotionSource {
  private socket: WebSocket | null = null
  private callbacks: MotionSourceCallbacks | null = null
  private readonly options: WebSocketSourceOptions

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
    this.callbacks = null
  }

  connect() {
    if (!this.options.url) {
      this.callbacks?.onError('WebSocket URL is empty.')
      this.setStatus('error')
      return
    }
    if (this.socket?.readyState === WebSocket.OPEN) return

    this.setStatus('connecting')
    this.socket = new WebSocket(this.options.url)

    this.socket.onopen = () => this.setStatus('open')
    this.socket.onclose = () => this.setStatus('closed')
    this.socket.onerror = () => {
      this.callbacks?.onError('Unable to connect to WebSocket backend.')
      this.setStatus('error')
    }
    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        switch (msg.type) {
          case 'frame':
            this.callbacks?.onFrame(msg.frame)
            break
          case 'done':
            this.callbacks?.onDone(msg.metadata)
            break
          case 'error':
            this.callbacks?.onError(msg.error)
            break
          case 'handshake':
            this.callbacks?.onCapabilities?.(msg.capabilities)
            break
        }
      } catch (err) {
        this.callbacks?.onError(err instanceof Error ? err.message : 'Invalid message format.')
      }
    }
  }

  close() {
    if (!this.socket) return
    this.socket.close()
    this.socket = null
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

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  private send(payload: object) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.callbacks?.onError('WebSocket is not connected.')
      return
    }
    this.socket.send(JSON.stringify(payload))
  }

  private setStatus(status: WsStatus) {
    this.options.onStatusChange?.(status)
  }
}
