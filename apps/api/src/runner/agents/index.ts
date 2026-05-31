import { AgentRunResult, runFlightWatcher } from './flight-watcher'
import { runJobApplicationTracker } from './job-application-tracker'

export type RunnerFn = (config: Record<string, unknown>) => Promise<AgentRunResult[]>

export const agentRunners: Record<string, RunnerFn> = {
  'flight-watcher': runFlightWatcher,
  'job-application-tracker': runJobApplicationTracker,
}
