import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsCompanies } from './schema.js'
import { sql, isNull } from 'drizzle-orm'

// Check specific CCaaS companies
const ccaasCompanies = ['Five9', 'Genesys', 'NICE', 'Talkdesk', 'Avaya', 'RingCentral', '8x8', 'Vonage', 'Twilio', 'Cisco']
const results = await db.execute(sql`
  SELECT name, specialization FROM ats_companies
  WHERE lower(name) IN (${sql.join(ccaasCompanies.map(c => sql`${c.toLowerCase()}`), sql`, `)})
  ORDER BY name
`)

const rows = (results as any).rows ?? results
console.log('Known CCaaS companies in DB:')
rows.forEach((r: any) => console.log(`  ${r.name}: ${r.specialization ?? 'NULL'}`))

// Overall null count
const nullCount = await db.select({ c: sql<string>`count(*)` }).from(atsCompanies).where(isNull(atsCompanies.specialization))
console.log(`\nTotal NULL: ${nullCount[0].c}`)

process.exit(0)
