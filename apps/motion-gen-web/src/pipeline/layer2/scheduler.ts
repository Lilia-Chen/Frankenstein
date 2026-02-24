import type { MotionPlayer } from '../player'
import type { WebSocketSource } from '../sources/websocket-source'
import type { SkillNode, SkillPlan } from '../../types/skill'

export interface SchedulerCallbacks {
  onNodeStart: (node: SkillNode) => void
  onNodeDone: (node: SkillNode) => void
  onPlanDone: (idleNode?: SkillNode) => void
  onError: (msg: string) => void
  onRequestId: (requestId: string) => void
}

export class SkillScheduler {
  private requestIdToNodeId = new Map<string, string>()
  private completedNodeIds = new Set<string>()
  private plan: SkillPlan | null = null
  private callbacks: SchedulerCallbacks | null = null
  private cancelled = false

  constructor(
    private ws: WebSocketSource,
    private player: MotionPlayer,
  ) {}

  start(plan: SkillPlan, callbacks: SchedulerCallbacks) {
    this.plan = plan
    this.callbacks = callbacks
    this.cancelled = false
    this.requestIdToNodeId.clear()
    this.completedNodeIds.clear()
    this.executeReady()
  }

  cancel() {
    this.cancelled = true
    for (const requestId of this.requestIdToNodeId.keys()) {
      this.ws.sendCancel(requestId)
    }
    this.requestIdToNodeId.clear()
    this.plan = null
    this.callbacks = null
  }

  /** Called by use-motion-pipeline onDone — returns true if this scheduler handled it */
  handleDone(doneId: string | undefined): boolean {
    if (!doneId || !this.requestIdToNodeId.has(doneId)) return false
    if (this.cancelled || !this.plan || !this.callbacks) return true

    const nodeId = this.requestIdToNodeId.get(doneId)!
    this.requestIdToNodeId.delete(doneId)
    this.completedNodeIds.add(nodeId)

    const node = this.plan.nodes.find((n) => n.id === nodeId)!
    this.callbacks.onNodeDone(node)

    if (this.completedNodeIds.size === this.plan.nodes.length) {
      this.callbacks.onPlanDone()
      return true
    }

    this.executeReady()
    return true
  }

  private executeReady() {
    if (!this.plan || !this.callbacks || this.cancelled) return
    for (const node of this.plan.nodes) {
      if (this.completedNodeIds.has(node.id)) continue
      if ([...this.requestIdToNodeId.values()].includes(node.id)) continue
      if (node.depends_on.every((dep) => this.completedNodeIds.has(dep))) {
        this.executeNode(node)
      }
    }
  }

  private executeNode(node: SkillNode) {
    if (!this.callbacks) return

    // idle is a looping skill — don't send to backend, hand off to auto-idle
    if (node.skill === 'idle') {
      this.completedNodeIds.add(node.id)
      this.callbacks.onNodeDone(node)
      this.callbacks.onPlanDone(node)
      return
    }

    const currentFrame = this.player.getFrameAtNow() ?? undefined
    const requestId = this.ws.sendGenerate(
      { text: node.params.text },
      { duration_seconds: node.params.duration_seconds, current_frame: currentFrame },
    )
    this.requestIdToNodeId.set(requestId, node.id)
    this.callbacks.onRequestId(requestId)
    this.callbacks.onNodeStart(node)
  }
}
