import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../lib/auth'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are accepted'))
  },
})

export const resumeRouter = Router()

// POST /api/resume — upload and parse PDF resume
resumeRouter.post('/', requireAuth, upload.single('resume'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  try {
    const parsed = await pdfParse(req.file.buffer)
    const resumeText = parsed.text.trim()
    if (!resumeText) return res.status(400).json({ error: 'Could not extract text from PDF — try a text-based PDF' })

    await db.insert(users)
      .values({ id: req.userId!, email: req.userId!, resumeText })
      .onConflictDoUpdate({ target: users.id, set: { resumeText } })

    res.json({ success: true, wordCount: resumeText.split(/\s+/).length, pages: parsed.numpages })
  } catch (err) {
    log.error('api', 'resume upload failed', err, { userId: req.userId })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process resume' })
  }
})

// GET /api/resume — check if user has a resume
resumeRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select({ resumeText: users.resumeText }).from(users).where(eq(users.id, req.userId!))
    const wordCount = user?.resumeText ? user.resumeText.split(/\s+/).length : 0
    res.json({ hasResume: Boolean(user?.resumeText), wordCount })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resume status' })
  }
})
