import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')
import { config } from 'dotenv'
config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { agentsRouter } from './routes/agents.js'
import { resultsRouter } from './routes/results.js'
import { webhooksRouter } from './routes/webhooks.js'
import { resumeRouter } from './routes/resume.js'
import { profileRouter } from './routes/profile.js'
import { applyFillRouter } from './routes/apply-fill.js'
import { billingRouter } from './routes/billing.js'
import { adminRouter } from './routes/admin.js'
import { downloadRouter } from './routes/download.js'
import { jobsRouter } from './routes/jobs.js'
import { startScheduler } from './runner/scheduler.js'
import { log } from './lib/logger.js'

const app = express()
const PORT = process.env.PORT || process.env.API_PORT || 3001

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
const allowedOrigins = [
  appUrl,
  appUrl.replace('https://www.', 'https://'),
  appUrl.replace('https://', 'https://www.'),
  'http://localhost:3000',
].filter(Boolean) as string[]
// Token-authenticated extension endpoint — manages its own permissive CORS,
// so mount it before the whitelist CORS middleware below.
app.use('/api/apply-fill', applyFillRouter)

app.use(cors({ origin: allowedOrigins, credentials: true }))

// Stripe webhook needs raw body — must come before express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use(express.json())

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'skove-api' }))

// Routes
app.use('/api/agents', agentsRouter)
app.use('/api/results', resultsRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/resume', resumeRouter)
app.use('/api/profile', profileRouter)
app.use('/api/billing', billingRouter)
app.use('/api/admin', adminRouter)
app.use('/api/download', downloadRouter)
app.use('/api/jobs', jobsRouter)

app.listen(PORT, () => {
  log.info('api', 'server started', { port: PORT })
  startScheduler().catch((err) => log.error('scheduler', 'failed to start', err))
})
