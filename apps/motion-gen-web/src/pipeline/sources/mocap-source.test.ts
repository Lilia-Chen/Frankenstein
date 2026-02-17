import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MotionFrame } from '../../types/motion'
import { MocapSource } from './mocap-source'

function makeFrame(timestamp: number): MotionFrame {
  return {
    timestamp,
    root_position: [0, 0, 0],
    root_rotation: [0, 0, 0, 1],
    joint_rotations: {},
  }
}

function makeCallbacks() {
  return {
    onFrame: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

function mockFetchWith(frames: MotionFrame[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(frames),
  }))
}

function mockFetchError(status: number) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(null),
  }))
}

function mockFetchReject(message: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)))
}

describe('MocapSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('emits frames sequentially with correct timing', async () => {
    const frames = [makeFrame(0), makeFrame(0.5), makeFrame(1.0)]
    mockFetchWith(frames)

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    // First frame emitted immediately
    expect(callbacks.onFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.onFrame).toHaveBeenCalledWith(frames[0])

    // Advance 500ms → second frame
    await vi.advanceTimersByTimeAsync(500)
    expect(callbacks.onFrame).toHaveBeenCalledTimes(2)
    expect(callbacks.onFrame).toHaveBeenCalledWith(frames[1])

    // Advance another 500ms → third frame + done
    await vi.advanceTimersByTimeAsync(500)
    expect(callbacks.onFrame).toHaveBeenCalledTimes(3)
    expect(callbacks.onFrame).toHaveBeenCalledWith(frames[2])
    expect(callbacks.onDone).toHaveBeenCalledWith({
      total_frames: 3,
      generation_time_ms: 0,
      model_name: 'mocap',
    })
  })

  it('emits done after single frame', async () => {
    mockFetchWith([makeFrame(0)])

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    expect(callbacks.onFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.onDone).toHaveBeenCalledTimes(1)
  })

  it('reports error on empty array', async () => {
    mockFetchWith([])

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    expect(callbacks.onError).toHaveBeenCalledWith('Mocap file contains no frames.')
    expect(callbacks.onFrame).not.toHaveBeenCalled()
  })

  it('reports error on fetch failure', async () => {
    mockFetchError(404)

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    expect(callbacks.onError).toHaveBeenCalledWith('Failed to fetch mocap data: 404')
  })

  it('reports error on network error', async () => {
    mockFetchReject('Network error')

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    expect(callbacks.onError).toHaveBeenCalledWith('Network error')
  })

  it('stop cancels pending frames', async () => {
    const frames = [makeFrame(0), makeFrame(0.5), makeFrame(1.0)]
    mockFetchWith(frames)

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    expect(callbacks.onFrame).toHaveBeenCalledTimes(1) // first frame

    source.stop()

    // Advance time — no more frames should emit
    await vi.advanceTimersByTimeAsync(2000)
    expect(callbacks.onFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.onDone).not.toHaveBeenCalled()
  })

  it('dispose clears everything', async () => {
    const frames = [makeFrame(0), makeFrame(0.5)]
    mockFetchWith(frames)

    const callbacks = makeCallbacks()
    const source = new MocapSource('/test.json')
    await source.start(callbacks)

    source.dispose()

    await vi.advanceTimersByTimeAsync(2000)
    // Only the first frame was emitted before dispose
    expect(callbacks.onFrame).toHaveBeenCalledTimes(1)
  })
})
