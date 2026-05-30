import { AgentRunResult, runFlightWatcher } from './flight-watcher'

export type RunnerFn = (config: Record<string, unknown>) => Promise<AgentRunResult[]>

export const agentRunners: Record<string, RunnerFn> = {
  'flight-watcher': runFlightWatcher,
}
