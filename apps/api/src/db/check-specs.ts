import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { sql } from 'drizzle-orm'

const result = await db.execute(sql`
  SELECT name, is_enabled, careers_url, last_fetched_at, specialization
  FROM ats_companies
  WHERE lower(specialization) = 'ccaas'
  ORDER BY name
  LIMIT 20
`)
const rows = (result as any).rows ?? result
console.log('CCaaS companies (enabled status):')
rows.forEach((r: any) => console.log(`  "${r.name}" | enabled=${r.is_enabled} | last_fetched=${r.last_fetched_at ?? 'never'} | url=${r.careers_url ?? 'none'}`))

process.exit(0)
