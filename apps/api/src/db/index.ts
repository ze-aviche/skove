import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

config({ path: '.env.local' })

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, { ssl: 'require' })
export const db = drizzle(client, { schema })
