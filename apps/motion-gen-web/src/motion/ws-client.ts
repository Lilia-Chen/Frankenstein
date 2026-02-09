import type {
  CancelRequest,
  FrameMessage,
  GenerateRequest,
  MotionSocketServerMessage,
} from '../types/motion'

export type WsClientStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

type MotionWebSocketClientOptions = {
  url: string
  onStatusChange?: (status: WsClientStatus) => void
  onFrame?: (message: FrameMessage) => void
  onError?: (message: string) => void
}

export class MotionWebSocketClient {
  private readonly options: MotionWebSocketClientOptions
  private socket: WebSocket | null = null

  constructor(options: MotionWebSocketClientOptions) {
    this.options = options
  }

  connect() {
    if (!this.options.url) {
      this.options.onError?.('WebSocket URL is empty.')
      this.setStatus('error')
      return
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return
    }

    this.setStatus('connecting')
    this.socket = new WebSocket(this.options.url)

    this.socket.onopen = () => this.setStatus('open')
    this.socket.onclose = () => this.setStatus('closed')
    this.socket.onerror = () => {
      this.options.onError?.('Unable to connect to WebSocket backend.')
      this.setStatus('error')
    }
    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as MotionSocketServerMessage
        if (payload.type === 'frame') {
          this.options.onFrame?.(payload)
        } else if (payload.type === 'error') {
          this.options.onError?.(payload.error)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid message format.'
        this.options.onError?.(message)
      }
    }
  }

  sendGenerate(req: GenerateRequest) {
    this.send(req)
  }

  sendCancel(req: CancelRequest) {
    this.send(req)
  }

  close() {
    if (!this.socket) return
    this.socket.close()
    this.socket = null
  }

  private send(payload: GenerateRequest | CancelRequest) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.options.onError?.('WebSocket is not connected.')
      return
    }
    this.socket.send(JSON.stringify(payload))
  }

  private setStatus(status: WsClientStatus) {
    this.options.onStatusChange?.(status)
  }
}

