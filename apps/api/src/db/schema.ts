import { pgTable, text, timestamp, jsonb, boolean, uuid, integer } from 'drizzle-orm/pg-core'

// Users synced from Clerk
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull(),
  resumeText: text('resume_text'),
  plan: text('plan').default('free').notNull(), // 'free' | 'pro'
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  planExpiresAt: timestamp('plan_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Agent definitions (built-in + marketplace)
export const agentDefinitions = pgTable('agent_definitions', {
  id: text('id').primaryKey(), // e.g. 'flight-watcher'
  name: text('name').notNull(),
  description: text('description').notNull(),
  configSchema: jsonb('config_schema').notNull(), // JSON Schema for user config
  schedule: text('schedule').notNull(), // cron expression
  authorId: text('author_id'), // null = built-in by Skove
  isPublished: boolean('is_published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// User's deployed agent instances
export const agentInstances = pgTable('agent_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  agentId: text('agent_id').notNull().references(() => agentDefinitions.id),
  config: jsonb('config').notNull(), // User's specific config values
  isActive: boolean('is_active').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Results produced by agent runs (instanceId nullable for manually-saved explorer results)
export const agentResults = pgTable('agent_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => agentInstances.id),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  value: text('value'), // e.g. "$241"
  url: text('url'),
  metadata: jsonb('metadata'), // any extra data the agent wants to store
  isRead: boolean('is_read').default(false).notNull(),
  isFavourite: boolean('is_favourite').default(false).notNull(),
  isApplied: boolean('is_applied').default(false).notNull(),
  appliedAt: timestamp('applied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const atsJobs = pgTable('ats_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  externalId: text('external_id'),
  applyUrl: text('apply_url').notNull().unique(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location').notNull(),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  description: text('description'),
  postedAt: text('posted_at').notNull(),
  metadata: jsonb('metadata'),
  titleSearch: text('title_search').notNull(),
  companySearch: text('company_search').notNull(),
  locationSearch: text('location_search').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const atsQueryCaches = pgTable('ats_query_caches', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryKey: text('query_key').notNull().unique(),
  queryText: text('query_text').notNull(),
  location: text('location').notNull(),
  companies: text('companies').notNull(),
  lastRefreshedAt: timestamp('last_refreshed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const atsCompanies = pgTable('ats_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  careersUrl: text('careers_url'),
  atsType: text('ats_type').notNull(),
  atsIdentifier: text('ats_identifier').notNull().unique(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  specialization: text('specialization'), // e.g. CCaaS, DevTools, Database, FinTech, HR Tech, API
  lastFetchedAt: timestamp('last_fetched_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
