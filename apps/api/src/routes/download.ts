import { Router } from 'express'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { db } from '../db/index.js'
import { agentResults } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'
import {
  buildResumePdf, buildCoverLetterPdf,
  buildResumeDocx, buildCoverLetterDocx,
  slugify,
} from '../lib/document.js'

export const downloadRouter = Router()

// GET /api/download/:resultId?type=resume|cover&format=pdf|docx
downloadRouter.get('/:resultId', requireAuth, async (req, res) => {
  const { resultId } = req.params
  const docType = (req.query.type as string) === 'cover' ? 'cover' : 'resume'
  const format = (req.query.format as string) === 'docx' ? 'docx' : 'pdf'

  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, resultId))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }

    const meta = (result.metadata ?? {}) as Record<string, unknown>
    const coverLetter = typeof meta.coverLetter === 'string' ? meta.coverLetter : null
    const tailoredResumeText = typeof meta.tailoredResumeText === 'string' ? meta.tailoredResumeText : null
    const jobTitle = typeof meta.jobTitle === 'string' ? meta.jobTitle : 'Position'
    const company = typeof meta.company === 'string' ? meta.company : 'Company'

    if (docType === 'cover' && !coverLetter) {
      return res.status(404).json({ error: 'No cover letter available for this result' })
    }
    if (docType === 'resume' && !tailoredResumeText) {
      return res.status(404).json({ error: 'No tailored resume available for this result' })
    }

    // Fetch candidate name from Clerk profile
    let candidateName = 'Candidate'
    try {
      const clerkUser = await clerkClient.users.getUser(req.userId!)
      const first = clerkUser.firstName ?? ''
      const last = clerkUser.lastName ?? ''
      const full = `${first} ${last}`.trim()
      if (full) candidateName = full
    } catch { /* non-fatal — fall back to default */ }

    const positionSlug = slugify(`${jobTitle}_${company}`)
    const prefix = docType === 'cover' ? 'cover_letter' : 'resume'
    const filename = `${prefix}_${positionSlug}.${format}`

    let buffer: Buffer
    if (format === 'pdf') {
      buffer = docType === 'cover'
        ? await buildCoverLetterPdf(coverLetter!, candidateName, jobTitle, company)
        : await buildResumePdf(tailoredResumeText!, candidateName)
      res.setHeader('Content-Type', 'application/pdf')
    } else {
      buffer = docType === 'cover'
        ? await buildCoverLetterDocx(coverLetter!, candidateName, jobTitle, company)
        : await buildResumeDocx(tailoredResumeText!, candidateName)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)

    log.info('download', 'document served', { resultId, docType, format, userId: req.userId })
  } catch (err) {
    log.error('download', 'document generation failed', err, { resultId, docType, format })
    res.status(500).json({ error: 'Failed to generate document' })
  }
})
