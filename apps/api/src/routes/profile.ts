import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../lib/auth.js'
import { db } from '../db/index.js'
import { profiles, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger.js'

export const profileRouter = Router()

const workHistoryItem = z.object({
  company: z.string().optional(),
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  summary: z.string().optional(),
})

const educationItem = z.object({
  school: z.string().optional(),
  degree: z.string().optional(),
  field: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
})

const profileSchema = z.object({
  firstName: z.string().max(120).optional().nullable(),
  lastName: z.string().max(120).optional().nullable(),
  preferredFirstName: z.string().max(120).optional().nullable(),
  preferredLastName: z.string().max(120).optional().nullable(),
  initials: z.string().max(20).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  currentLocation: z.string().max(200).optional().nullable(),
  workAuthorization: z.string().max(60).optional().nullable(),
  needsSponsorship: z.boolean().optional().nullable(),
  linkedinUrl: z.string().max(300).optional().nullable(),
  githubUrl: z.string().max(300).optional().nullable(),
  portfolioUrl: z.string().max(300).optional().nullable(),
  workHistory: z.array(workHistoryItem).max(30).optional().nullable(),
  education: z.array(educationItem).max(20).optional().nullable(),
  gender: z.string().max(60).optional().nullable(),
  race: z.string().max(120).optional().nullable(),
  hispanicLatino: z.string().max(20).optional().nullable(),
  veteranStatus: z.string().max(120).optional().nullable(),
  disabilityStatus: z.string().max(120).optional().nullable(),
  aiUsage: z.string().max(2000).optional().nullable(),
  locatedBayArea: z.string().max(20).optional().nullable(),
  reasonForChange: z.string().max(2000).optional().nullable(),
  compensationTarget: z.string().max(200).optional().nullable(),
  directReports: z.string().max(200).optional().nullable(),
  eeoAnswers: z.record(z.string()).optional().nullable(),
})

// GET /api/profile — the current user's structured applicant profile
profileRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, req.userId!))
    res.json({ profile: row ?? null })
  } catch (err) {
    log.error('api', 'profile fetch failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// PUT /api/profile — create or update the profile
profileRouter.put('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid profile', details: parsed.error.flatten() })
  }

  try {
    // Ensure a users row exists (FK target) — mirrors resume.ts upsert behaviour
    await db.insert(users)
      .values({ id: req.userId!, email: req.userId! })
      .onConflictDoNothing({ target: users.id })

    const values = { ...parsed.data, userId: req.userId!, updatedAt: new Date() }
    const [row] = await db.insert(profiles)
      .values(values)
      .onConflictDoUpdate({ target: profiles.userId, set: { ...parsed.data, updatedAt: new Date() } })
      .returning()

    res.json({ profile: row })
  } catch (err) {
    log.error('api', 'profile update failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to save profile' })
  }
})
