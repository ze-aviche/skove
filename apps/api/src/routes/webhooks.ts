import { Router } from 'express'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export const webhooksRouter = Router()

// POST /api/webhooks/clerk — sync user from Clerk on sign-up or update
webhooksRouter.post('/clerk', async (req, res) => {
  // TODO: verify Clerk webhook signature with svix
  const { type, data } = req.body

  if (type === 'user.created' || type === 'user.updated') {
    const userId: string = data.id
    const email: string = data.email_addresses?.[0]?.email_address ?? userId

    const existing = await db.select().from(users).where(eq(users.id, userId))
    if (existing[0]) {
      await db.update(users).set({ email }).where(eq(users.id, userId))
    } else {
      await db.insert(users).values({ id: userId, email })
    }

    console.log(`[webhook] Synced user ${userId} (${email})`)
  }

  res.json({ received: true })
})
