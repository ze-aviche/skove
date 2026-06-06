# ATS Job Pipeline

How job listings from Lever, Greenhouse, and Ashby are fetched, stored, and served to users.

## Architecture overview

The pipeline has two independent parts:

```
Background (system cron)          User-facing (per-user agent)
─────────────────────────         ──────────────────────────────
ats-company-refresher             job-application-tracker
  runs every hour                   runs on user's schedule
  fetches 200 companies/run         queries ats_jobs DB only
  persists to ats_jobs              scores matches with Claude
  updates lastFetchedAt             falls back to Adzuna/JSearch
  cleans up 14-day-old jobs         if DB returns nothing
```

The tracker **never makes external ATS API calls**. All live fetching is owned by the refresher.

## Background refresher

**File:** `apps/api/src/runner/agents/ats-company-refresher.ts`  
**Schedule:** `0 * * * *` (top of every hour, registered in `scheduler.ts`)

### What it does each run

1. Deletes `ats_jobs` rows older than 14 days
2. Queries `ats_companies WHERE is_enabled = true ORDER BY last_fetched_at ASC NULLS FIRST LIMIT 200`
3. Processes companies in parallel batches of 20
4. For each company: fetches all open jobs → persists to `ats_jobs` → updates `lastFetchedAt`

### Full cycle time

9,708 companies ÷ 200 per hour = ~49 hours for a complete pass. Any given company's listings are at most ~2 days stale.

### ATS provider routing

The refresher infers the correct provider from `careersUrl` before using `atsType`:

| careersUrl contains | Resolved provider |
|---|---|
| `greenhouse.io` | greenhouse |
| `lever.co` | lever |
| `ashbyhq.com` / `boards.ashby.io` | ashby |
| (nothing recognisable) | falls back to stored `atsType` |

This self-corrects cases where the seed CSV had the wrong `atsType`.

### Lever slug fallback

Lever slugs are case-sensitive. If the stored `atsIdentifier` returns 404, the refresher tries:

1. Original-case path segment from `careersUrl` (e.g. `Beamy` from `jobs.lever.co/Beamy`)
2. Lowercased version of that slug
3. Normalised company name
4. Hyphenated company name

All candidates are deduplicated and already-tried slugs are skipped. One consolidated warning is logged if everything fails.

## Company data source

Companies are seeded from the [`kalil0321/ats-scrapers`](https://github.com/kalil0321/ats-scrapers) CSV files (Lever, Greenhouse, Ashby). The seed runs via:

```bash
cd apps/api
npx tsx src/db/seed-ats-companies.ts
```

This is idempotent — it upserts on `atsIdentifier`.

## Database tables

### `ats_companies`

| Column | Purpose |
|---|---|
| `ats_identifier` | Slug used in API URLs (unique) |
| `ats_type` | `lever` \| `greenhouse` \| `ashby` \| `custom` |
| `careers_url` | Used for slug fallback and provider inference |
| `is_enabled` | Set to `false` to skip a company |
| `last_fetched_at` | Drives the "oldest first" refresh ordering; NULL = never fetched |

### `ats_jobs`

Stores all persisted job listings. Unique on `apply_url`. Has `title_search`, `company_search`, `location_search` columns (lowercase) for `LIKE` queries. Rows are deleted after 14 days.

## User-facing tracker

**File:** `apps/api/src/runner/agents/job-application-tracker.ts`

Queries `ats_jobs` filtered by the user's `jobTitle` and `location` config, with a limit of 50 rows. Falls back to external job boards (Adzuna → JSearch → RemoteOK) only if the DB returns nothing. Passes each result through Claude for resume scoring when the user has uploaded a resume.

The `atsFirstOnly` config flag suppresses the external-board fallback.

## Adding a company manually

Insert directly into `ats_companies`:

```sql
INSERT INTO ats_companies (name, careers_url, ats_type, ats_identifier, is_enabled, updated_at)
VALUES ('Acme Corp', 'https://jobs.lever.co/acmecorp', 'lever', 'acmecorp', true, now());
```

The refresher will pick it up in the next hourly run (NULL `last_fetched_at` sorts first).

## Disabling a broken company

```sql
UPDATE ats_companies SET is_enabled = false WHERE ats_identifier = 'bad-slug';
```
