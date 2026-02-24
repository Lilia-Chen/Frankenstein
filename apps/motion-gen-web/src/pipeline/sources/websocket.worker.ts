// WebSocket Worker — runs WebSocket and JSON.parse off the main thread.
// Main thread sends commands via postMessage; worker sends parsed messages back.

type WorkerCommand =
  | { type: 'connect'; url: string }
  | { type: 'disconnect' }
  | { type: 'send'; data: string }

let socket: WebSocket | null = null

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data
  switch (cmd.type) {
    case 'connect':
      if (socket) { socket.close(); socket = null }
      socket = new WebSocket(cmd.url)
      socket.onopen = () => self.postMessage({ type: 'status', status: 'open' })
      socket.onclose = () => self.postMessage({ type: 'status', status: 'closed' })
      socket.onerror = () => self.postMessage({ type: 'status', status: 'error' })
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)
          self.postMessage({ type: 'message', msg })
        } catch {
          self.postMessage({ type: 'status', status: 'error' })
        }
      }
      self.postMessage({ type: 'status', status: 'connecting' })
      break
    case 'disconnect':
      socket?.close()
      socket = null
      break
    case 'send':
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(cmd.data)
      }
      break
  }
}
