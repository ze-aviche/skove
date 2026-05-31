import { pgTable, text, timestamp, jsonb, boolean, uuid } from 'drizzle-orm/pg-core'

// Users synced from Clerk
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull(),
  resumeText: text('resume_text'),
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

// Results produced by agent runs
export const agentResults = pgTable('agent_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => agentInstances.id),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  value: text('value'), // e.g. "$241"
  url: text('url'),
  metadata: jsonb('metadata'), // any extra data the agent wants to store
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
