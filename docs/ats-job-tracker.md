# ATS Job Tracker Flow and Logging

This document describes the backend logic, cache behavior, and log messages for the ATS-first job tracker agent in `apps/api/src/runner/agents/job-application-tracker.ts`.

## Overview

The job tracker is an autonomous agent that searches ATS-hosted jobs first, caches them in the database, and optionally falls back to broader job search sources when ATS results are not available.

## Config values used

- `jobTitle` — primary job query
- `location` — job location or `Remote`
- `minSalary` — minimum salary filter
- `keywords` — supplemental search terms
- `atsCompanies` — comma-separated list of ATS companies to query
- `atsFirstOnly` — whether to skip fallback sources
- `matchThreshold` — score threshold for resume matching

## Query normalization

The runner builds normalized values for the query:

- `what = [jobTitle, keywords].filter(Boolean).join(' ')`
- `where = isRemote ? 'remote' : location`
- `companies = normalized ATS company list`
- `minSalary` is also included in the cache key

## Cache and persistence flow

1. Load user resume text from `users` for scoring.
2. Run `cleanupOldATSCache()`:
   - delete `ats_jobs` older than 14 days
   - delete `ats_query_caches` older than 14 days
3. Attempt cache lookup using `ats_query_caches.queryKey`.
4. If cache exists:
   - load stored jobs from `ats_jobs` matching title, location, companies, and salary criteria
   - if row age > 1 hour or no rows are found, refresh from external ATS sources
   - persist fresh jobs and update the cache timestamp
5. If no cache exists:
   - query external ATS sources immediately
   - persist jobs to `ats_jobs`
   - create a new cache entry in `ats_query_caches`

## Stored-job filtering

`fetchStoredATSJobs(...)` applies these conditions:

- title contains query text (`ILIKE %title%`)
- location contains the requested location or remote term
- company contains one of the requested organizations
- salary filter:
  - include jobs with no salary value
  - include jobs whose `salaryMin >= minSalary`

This preserves jobs without salary data while honoring the configured minimum salary for defined salary values.

## ATS provider fetching

The runner fetches from these sources in parallel:

- `fetchLeverJobs(...)`
- `fetchGreenhouseJobs(...)`
- `fetchAshbyJobs(...)`

Each provider now applies `minSalary` filtering as follows:

- if salary is missing, keep the job
- if salary exists, require `salary >= minSalary`

Fetched jobs are persisted to `ats_jobs` and can be reused by later runs.

## Fallback logic

If `atsFirstOnly` is false and ATS results are empty, fallback sources are queried in order:

1. `fetchAdzuna(...)`
2. `fetchJSearch(...)`
3. `fetchRemoteOK(...)` (only for remote searches)

If `atsFirstOnly` is true, fallback sources are skipped.

## Result assembly and scoring

- The runner returns up to 8 job results.
- Already-seen jobs are skipped using `ctx.seenKeys`.
- Each job is converted to `AgentRunResult` with metadata.
- If user resume text exists, the runner:
  - scores the job with `scoreJobMatch(...)`
  - if score >= threshold, optionally tailors the resume with `tailorResume(...)`

## Logging strings to search for

Search Railway logs for these exact messages under `job-tracker`:

- `ats db cache hit`
- `ats refresh fetch complete`
- `ats refresh yielded no db rows, using fetched jobs`
- `ats fetch on cache miss complete`
- `adzuna fetch complete`
- `jsearch fallback complete`
- `remoteok fallback complete`
- `ats-first-only mode active`
- `jobs fetched`

Warnings and errors:

- `adzuna request failed`
- `adzuna api error`
- `jsearch request failed`
- `resume tailoring failed`
- `claude scoring failed`

## Notes

- The ATS flow is intentionally cache-first and query-key based.
- `minSalary` is included in the cache signature so salary-sensitive queries do not reuse stale/incorrect cached results.
- Provider fetches preserve jobs missing salary data while honoring salary thresholds for jobs with salary values.
