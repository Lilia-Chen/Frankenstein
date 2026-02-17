import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketSource, type WsStatus } from './websocket-source'

// ── Mock WebSocket ──

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  sent: string[] = []

  constructor(url: string) {
    this.url = url
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateError() {
    this.onerror?.()
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateRawMessage(data: string) {
    this.onmessage?.({ data })
  }
}

let lastCreatedSocket: MockWebSocket | null = null

beforeEach(() => {
  lastCreatedSocket = null
  vi.stubGlobal('WebSocket', class extends MockWebSocket {
    constructor(url: string) {
      super(url)
      lastCreatedSocket = this
    }

    static override OPEN = 1
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeCallbacks() {
  return {
    onFrame: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onCapabilities: vi.fn(),
  }
}

describe('WebSocketSource', () => {
  describe('connect', () => {
    it('transitions to connecting then open', () => {
      const statuses: WsStatus[] = []
      const source = new WebSocketSource({
        url: 'ws://localhost:8000',
        onStatusChange: (s) => statuses.push(s),
      })
      source.start(makeCallbacks())

      expect(statuses).toContain('connecting')

      lastCreatedSocket!.simulateOpen()
      expect(statuses).toContain('open')
    })

    it('reports error on connection failure', () => {
      const callbacks = makeCallbacks()
      const statuses: WsStatus[] = []
      const source = new WebSocketSource({
        url: 'ws://localhost:8000',
        onStatusChange: (s) => statuses.push(s),
      })
      source.start(callbacks)

      lastCreatedSocket!.simulateError()
      expect(callbacks.onError).toHaveBeenCalledWith('Unable to connect to WebSocket backend.')
      expect(statuses).toContain('error')
    })

    it('reports error when URL is empty', () => {
      const callbacks = makeCallbacks()
      const statuses: WsStatus[] = []
      const source = new WebSocketSource({
        url: '',
        onStatusChange: (s) => statuses.push(s),
      })
      source.start(callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith('WebSocket URL is empty.')
      expect(statuses).toContain('error')
    })
  })

  describe('message handling', () => {
    function connectedSource() {
      const callbacks = makeCallbacks()
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(callbacks)
      lastCreatedSocket!.simulateOpen()
      return { source, callbacks, socket: lastCreatedSocket! }
    }

    it('dispatches frame messages', () => {
      const { callbacks, socket } = connectedSource()
      const frame = { timestamp: 0, root_position: [0, 0, 0], root_rotation: [0, 0, 0, 1], joint_rotations: {} }
      socket.simulateMessage({ type: 'frame', id: '1', frame })
      expect(callbacks.onFrame).toHaveBeenCalledWith(frame)
    })

    it('dispatches done messages', () => {
      const { callbacks, socket } = connectedSource()
      const metadata = { total_frames: 90, generation_time_ms: 500, model_name: 'test' }
      socket.simulateMessage({ type: 'done', id: '1', metadata })
      expect(callbacks.onDone).toHaveBeenCalledWith(metadata)
    })

    it('dispatches error messages', () => {
      const { callbacks, socket } = connectedSource()
      socket.simulateMessage({ type: 'error', id: '1', error: 'something broke' })
      expect(callbacks.onError).toHaveBeenCalledWith('something broke')
    })

    it('dispatches handshake messages', () => {
      const { callbacks, socket } = connectedSource()
      const capabilities = { supportsText: true, supportsSpatial: false, supportsTrajectory: false, supportsTransition: false }
      socket.simulateMessage({ type: 'handshake', capabilities })
      expect(callbacks.onCapabilities).toHaveBeenCalledWith(capabilities)
    })

    it('reports error on invalid JSON', () => {
      const { callbacks, socket } = connectedSource()
      socket.simulateRawMessage('not json{{{')
      expect(callbacks.onError).toHaveBeenCalled()
    })
  })

  describe('sendGenerate', () => {
    it('sends correctly formatted message', () => {
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(makeCallbacks())
      lastCreatedSocket!.simulateOpen()

      vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })
      source.sendGenerate({ text: 'walk forward' }, { duration_seconds: 3, fps: 30 })

      const sent = JSON.parse(lastCreatedSocket!.sent[0])
      expect(sent.type).toBe('generate')
      expect(sent.id).toBe('test-uuid')
      expect(sent.payload.conditioning).toEqual({ text: 'walk forward' })
      expect(sent.payload.duration_seconds).toBe(3)
      expect(sent.payload.fps).toBe(30)
    })
  })

  describe('sendCancel', () => {
    it('sends cancel message', () => {
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(makeCallbacks())
      lastCreatedSocket!.simulateOpen()

      source.sendCancel('req-123')
      const sent = JSON.parse(lastCreatedSocket!.sent[0])
      expect(sent).toEqual({ type: 'cancel', id: 'req-123' })
    })
  })

  describe('send when not connected', () => {
    it('reports error', () => {
      const callbacks = makeCallbacks()
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(callbacks)
      // Don't open the socket

      source.sendCancel('req-123')
      expect(callbacks.onError).toHaveBeenCalledWith('WebSocket is not connected.')
    })
  })

  describe('close / dispose', () => {
    it('closes the socket', () => {
      const statuses: WsStatus[] = []
      const source = new WebSocketSource({
        url: 'ws://localhost:8000',
        onStatusChange: (s) => statuses.push(s),
      })
      source.start(makeCallbacks())
      lastCreatedSocket!.simulateOpen()

      source.close()
      expect(statuses).toContain('closed')
    })

    it('dispose stops receiving callbacks', () => {
      const callbacks = makeCallbacks()
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(callbacks)
      const socket = lastCreatedSocket!
      socket.simulateOpen()

      source.dispose()

      // Simulate a message after dispose — callbacks should not fire
      // (socket is closed, so onmessage won't fire anyway)
      expect(callbacks.onFrame).not.toHaveBeenCalled()
    })
  })

  describe('isConnected', () => {
    it('returns false before connect', () => {
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      expect(source.isConnected).toBe(false)
    })

    it('returns true after open', () => {
      const source = new WebSocketSource({ url: 'ws://localhost:8000' })
      source.start(makeCallbacks())
      lastCreatedSocket!.simulateOpen()
      expect(source.isConnected).toBe(true)
    })
  })
})
