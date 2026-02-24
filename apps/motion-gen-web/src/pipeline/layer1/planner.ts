import { generateText } from '@xsai/generate-text'
import type { SkillPlan } from '../../types/skill'

const SYSTEM_PROMPT = `You are a motion planner for a virtual humanoid avatar.
Given a natural language instruction, output a JSON object with this exact schema:
{
  "description": "<original intent>",
  "nodes": [
    {
      "id": "node_1",
      "skill": "<skill name>",
      "params": { "text": "<motion description for the generator>", "duration_seconds": <number or omit> },
      "depends_on": []
    }
  ]
}

Available skills: walk, run, sit, stand, wave, idle, turn, reach
Rules:
- Each node id must be unique (node_1, node_2, ...)
- depends_on lists ids of nodes that must complete before this one starts
- The last node MUST be "idle" or another looping skill so the avatar never freezes
- Keep plans to 2-5 nodes
- Output ONLY the JSON object, no markdown, no explanation`

export interface PlannerOptions {
  apiKey: string
  baseURL: string
  model: string
}

export async function planFromText(input: string, opts: PlannerOptions): Promise<SkillPlan> {
  const { text } = await generateText({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    model: opts.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input },
    ],
  })
  if (!text) throw new Error('LLM returned empty response')
  // strip possible markdown code fences
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(json) as SkillPlan
}
