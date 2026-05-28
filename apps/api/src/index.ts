import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { agentsRouter } from './routes/agents'
import { resultsRouter } from './routes/results'
import { webhooksRouter } from './routes/webhooks'

const app = express()
const PORT = process.env.API_PORT || 3001

app.use(cors({ origin: process.env.NEXT_PUBLIC_APP_URL }))
app.use(express.json())

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'skove-api' }))

// Routes
app.use('/api/agents', agentsRouter)
app.use('/api/results', resultsRouter)
app.use('/api/webhooks', webhooksRouter)

app.listen(PORT, () => {
  console.log(`Skove API running on http://localhost:${PORT}`)
})
