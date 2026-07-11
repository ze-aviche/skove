import { AgentRunResult } from './types.js'
import { runJobApplicationTracker } from './job-application-tracker.js'

export type RunnerContext = { userId: string; seenKeys: Set<string> }
export type RunnerFn = (config: Record<string, unknown>, ctx: RunnerContext) => Promise<AgentRunResult[]>

export { AgentRunResult }

export const agentRunners: Record<string, RunnerFn> = {
  'job-application-tracker': runJobApplicationTracker,
}
