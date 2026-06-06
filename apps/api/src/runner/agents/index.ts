import { AgentRunResult, runFlightWatcher } from './flight-watcher.js'
import { runJobApplicationTracker } from './job-application-tracker.js'
import { runRentalListingMonitor } from './rental-listing-monitor.js'

export type RunnerContext = { userId: string; seenKeys: Set<string> }
export type RunnerFn = (config: Record<string, unknown>, ctx: RunnerContext) => Promise<AgentRunResult[]>

export { AgentRunResult }

export const agentRunners: Record<string, RunnerFn> = {
  'flight-watcher': runFlightWatcher,
  'job-application-tracker': runJobApplicationTracker,
  'rental-listing-monitor': runRentalListingMonitor,
}
