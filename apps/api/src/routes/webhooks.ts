import { Router, Request, Response } from 'express'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger'
import { getStripe, Stripe } from '../lib/stripe'

export const webhooksRouter = Router()

// POST /api/webhooks/stripe — handle subscription lifecycle events
webhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature']
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    log.warn('webhook', 'STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook secret not configured' })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig as string, secret)
  } catch (err) {
    log.error('webhook', 'stripe signature verification failed', err)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { metadata?: { userId?: string }; subscription?: string; customer?: string }
        const userId = session.metadata?.userId
        if (userId) {
          await db.update(users).set({
            plan: 'pro',
            stripeSubscriptionId: String(session.subscription ?? ''),
            stripeCustomerId: String(session.customer ?? ''),
            planExpiresAt: null,
          }).where(eq(users.id, userId))
          log.info('webhook', 'user upgraded to pro', { userId })
        }
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as { id: string; status: string; current_period_end: number; cancel_at_period_end: boolean }
        const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, sub.id))
        if (user) {
          const isActive = sub.status === 'active' || sub.status === 'trialing'
          await db.update(users).set({
            plan: isActive ? 'pro' : 'free',
            planExpiresAt: sub.cancel_at_period_end ? new Date(sub.current_period_end * 1000) : null,
          }).where(eq(users.id, user.id))
          log.info('webhook', 'subscription updated', { userId: user.id, status: sub.status })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string }
        const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, sub.id))
        if (user) {
          await db.update(users).set({ plan: 'free', stripeSubscriptionId: null, planExpiresAt: null }).where(eq(users.id, user.id))
          log.info('webhook', 'subscription cancelled, downgraded to free', { userId: user.id })
        }
        break
      }
    }
  } catch (err) {
    log.error('webhook', 'stripe event processing failed', err, { type: event.type })
    return res.status(500).json({ error: 'Event processing failed' })
  }

  res.json({ received: true })
})

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

    log.info('webhook', 'user synced', { userId, email, event: type })
  }

  res.json({ received: true })
})
