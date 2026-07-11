import { Router, json } from 'express'
import { db } from '../db/index.js'
import { applications, users, profiles, agentResults } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger.js'
import { verifyFillToken } from '../lib/fill-token.js'
import { answerScreeningQuestions } from '../lib/claude.js'

export const applyFillRouter = Router()

function cors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// Map a stored profile row to the ApplyProfile shape the LLM consumes
function toApplyProfile(profileRow: any, email?: string | null) {
  return {
    firstName: profileRow?.firstName, lastName: profileRow?.lastName,
    preferredFirstName: profileRow?.preferredFirstName, preferredLastName: profileRow?.preferredLastName,
    initials: profileRow?.initials, email,
    phone: profileRow?.phone, city: profileRow?.city, country: profileRow?.country,
    currentLocation: profileRow?.currentLocation,
    workAuthorization: profileRow?.workAuthorization, needsSponsorship: profileRow?.needsSponsorship,
    linkedinUrl: profileRow?.linkedinUrl, githubUrl: profileRow?.githubUrl, portfolioUrl: profileRow?.portfolioUrl,
    gender: profileRow?.gender, race: profileRow?.race, hispanicLatino: profileRow?.hispanicLatino,
    veteranStatus: profileRow?.veteranStatus, disabilityStatus: profileRow?.disabilityStatus,
    aiUsage: profileRow?.aiUsage, locatedBayArea: profileRow?.locatedBayArea,
    reasonForChange: profileRow?.reasonForChange, compensationTarget: profileRow?.compensationTarget,
    directReports: profileRow?.directReports,
  }
}

// GET /api/apply-fill?token=... — public (token-authenticated) endpoint the
// browser extension's content script calls from the ATS page origin. Returns the
// prepared application package plus the resume file (base64) so the extension can
// fill the form and stage the resume. No Clerk session — the signed token is the
// credential, so this endpoint allows cross-origin requests.
applyFillRouter.get('/', async (req, res) => {
  cors(res)

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
    const [profileRow] = await db.select().from(profiles).where(eq(profiles.userId, payload.userId))

    const pkg = (application.payload ?? {}) as Record<string, any>
    const resume = user?.resumeFile
      ? {
          filename: user.resumeFileName || 'resume.pdf',
          mimeType: user.resumeMimeType || 'application/pdf',
          base64: Buffer.from(user.resumeFile).toString('base64'),
        }
      : null

    // Demographic / EEO + dropdown-friendly values for the extension to match
    // against <select> options and radio choices.
    const demographics = {
      gender: profileRow?.gender ?? '',
      race: profileRow?.race ?? '',
      hispanicLatino: profileRow?.hispanicLatino ?? '',
      veteranStatus: profileRow?.veteranStatus ?? '',
      disabilityStatus: profileRow?.disabilityStatus ?? '',
      workAuthorization: profileRow?.workAuthorization ?? '',
      needsSponsorship: profileRow?.needsSponsorship ?? null,
      locatedBayArea: profileRow?.locatedBayArea ?? '',
    }

    res.json({
      atsType: application.atsType,
      fields: pkg.fields ?? {},
      demographics,
      screeningAnswers: pkg.screeningAnswers ?? [],
      coverLetter: pkg.coverLetter ?? '',
      resume,
    })
  } catch (err) {
    log.error('api', 'GET /api/apply-fill failed', err, { applicationId: payload.applicationId })
    res.status(500).json({ error: 'Failed to load application package' })
  }
})

// POST /api/apply-fill/answer — answer arbitrary questions the extension read off
// the live ATS form but couldn't fill from the prepared package. Token-authenticated.
applyFillRouter.post('/answer', json({ limit: '256kb' }), async (req, res) => {
  cors(res)

  const token = String(req.body?.token || '')
  const questions = Array.isArray(req.body?.questions) ? req.body.questions.filter((q: any) => typeof q === 'string').slice(0, 25) : []
  const payload = verifyFillToken(token)
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
  if (questions.length === 0) return res.json({ answers: [] })

  try {
    const [application] = await db.select().from(applications).where(eq(applications.id, payload.applicationId))
    if (!application || application.userId !== payload.userId) {
      return res.status(404).json({ error: 'Application not found' })
    }

    const [user] = await db.select({ resumeText: users.resumeText, email: users.email }).from(users).where(eq(users.id, payload.userId))
    const [profileRow] = await db.select().from(profiles).where(eq(profiles.userId, payload.userId))

    let job = { title: '', company: '', location: '', description: undefined as string | undefined }
    if (application.resultId) {
      const [result] = await db.select().from(agentResults).where(eq(agentResults.id, application.resultId))
      const meta = (result?.metadata ?? {}) as Record<string, any>
      job = {
        title: meta.jobTitle ?? result?.title ?? '',
        company: meta.company ?? '',
        location: meta.location ?? '',
        description: meta.description,
      }
    }

    const answers = await answerScreeningQuestions(
      toApplyProfile(profileRow, user?.email),
      user?.resumeText ?? '',
      job,
      questions,
    )
    log.info('api', 'dynamic answers generated', { applicationId: application.id, count: answers.length })
    res.json({ answers })
  } catch (err) {
    log.error('api', 'POST /api/apply-fill/answer failed', err, { applicationId: payload.applicationId })
    res.status(500).json({ error: 'Failed to answer questions' })
  }
})

// Preflight for the cross-origin requests
applyFillRouter.options(['/', '/answer'], (_req, res) => {
  cors(res)
  res.sendStatus(204)
})
