import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')
import { config } from 'dotenv'
config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { agentsRouter } from './routes/agents'
import { resultsRouter } from './routes/results'
import { webhooksRouter } from './routes/webhooks'
import { resumeRouter } from './routes/resume'
import { startScheduler } from './runner/scheduler'
import { log } from './lib/logger'

const app = express()
const PORT = process.env.PORT || process.env.API_PORT || 3001

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
const allowedOrigins = [
  appUrl,
  appUrl.replace('https://www.', 'https://'),   // bare domain
  appUrl.replace('https://', 'https://www.'),    // www variant
  'http://localhost:3000',
].filter(Boolean) as string[]
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'skove-api' }))

// Routes
app.use('/api/agents', agentsRouter)
app.use('/api/results', resultsRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/resume', resumeRouter)

app.listen(PORT, () => {
  log.info('api', 'server started', { port: PORT })
  startScheduler().catch((err) => log.error('scheduler', 'failed to start', err))
})
