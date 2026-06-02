import { AgentRunResult, runFlightWatcher } from './flight-watcher'
import { runJobApplicationTracker } from './job-application-tracker'
import { runRentalListingMonitor } from './rental-listing-monitor'

export type RunnerContext = { userId: string; seenKeys: Set<string> }
export type RunnerFn = (config: Record<string, unknown>, ctx: RunnerContext) => Promise<AgentRunResult[]>

export { AgentRunResult }

export const agentRunners: Record<string, RunnerFn> = {
  'flight-watcher': runFlightWatcher,
  'job-application-tracker': runJobApplicationTracker,
  'rental-listing-monitor': runRentalListingMonitor,
}
