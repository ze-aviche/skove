import { Router } from 'express'
import { db } from '../db/index.js'
import { applications, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger.js'
import { verifyFillToken } from '../lib/fill-token.js'

export const applyFillRouter = Router()

// GET /api/apply-fill?token=... — public (token-authenticated) endpoint the
// browser extension's content script calls from the ATS page origin. Returns the
// prepared application package plus the resume file (base64) so the extension can
// fill the form and stage the resume. No Clerk session — the signed token is the
// credential, so this endpoint allows cross-origin requests.
applyFillRouter.get('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const token = String(req.query.token || '')
  const payload = verifyFillToken(token)
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })

  try {
    const [application] = await db.select().from(applications).where(eq(applications.id, payload.applicationId))
    if (!application || application.userId !== payload.userId) {
      return res.status(404).json({ error: 'Application not found' })
    }

    const [user] = await db
      .select({ resumeFile: users.resumeFile, resumeFileName: users.resumeFileName, resumeMimeType: users.resumeMimeType })
      .from(users).where(eq(users.id, payload.userId))

    const pkg = (application.payload ?? {}) as Record<string, any>
    const resume = user?.resumeFile
      ? {
          filename: user.resumeFileName || 'resume.pdf',
          mimeType: user.resumeMimeType || 'application/pdf',
          base64: Buffer.from(user.resumeFile).toString('base64'),
        }
      : null

    res.json({
      atsType: application.atsType,
      fields: pkg.fields ?? {},
      screeningAnswers: pkg.screeningAnswers ?? [],
      coverLetter: pkg.coverLetter ?? '',
      resume,
    })
  } catch (err) {
    log.error('api', 'GET /api/apply-fill failed', err, { applicationId: payload.applicationId })
    res.status(500).json({ error: 'Failed to load application package' })
  }
})

// Preflight for the cross-origin GET
applyFillRouter.options('/', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.sendStatus(204)
})
