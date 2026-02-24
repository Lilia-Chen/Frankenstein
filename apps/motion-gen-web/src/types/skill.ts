export interface SkillNode {
  id: string
  skill: string
  params: {
    text: string
    duration_seconds?: number
  }
  depends_on: string[]
}

export interface SkillPlan {
  nodes: SkillNode[]
  description: string
}

export type SkillNodeStatus = 'pending' | 'active' | 'done'
