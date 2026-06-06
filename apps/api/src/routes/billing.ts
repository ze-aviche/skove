import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getStripe, PLANS } from '../lib/stripe.js'
import { log } from '../lib/logger.js'

export const billingRouter = Router()

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// GET /api/billing/plan — get current user's plan + usage
billingRouter.get('/plan', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!))
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({
      plan: user.plan,
      stripeCustomerId: user.stripeCustomerId,
      planExpiresAt: user.planExpiresAt,
    })
  } catch (err) {
    log.error('api', 'GET /api/billing/plan failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to fetch plan' })
  }
})

// POST /api/billing/checkout — create Stripe checkout session for upgrade
billingRouter.post('/checkout', requireAuth, async (req, res) => {
  try {
    const priceId = PLANS.pro.priceId
    if (!priceId) return res.status(503).json({ error: 'Stripe price not configured' })

    const [user] = await db.select().from(users).where(eq(users.id, req.userId!))
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Reuse existing customer or create new
    let customerId = user.stripeCustomerId ?? undefined
    if (!customerId) {
      const customer = await getStripe().customers.create({ email: user.email, metadata: { userId: user.id } })
      customerId = customer.id
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id))
    }

    const TRIAL_DAYS = Number(process.env.TRIAL_PERIOD_DAYS ?? 14)

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: TRIAL_DAYS > 0 ? { trial_period_days: TRIAL_DAYS } : undefined,
      success_url: `${APP_URL}/dashboard/profile?upgraded=1`,
      cancel_url: `${APP_URL}/dashboard/profile`,
      metadata: { userId: user.id },
    })

    log.info('billing', 'checkout session created', { userId: user.id, sessionId: session.id })
    res.json({ url: session.url })
  } catch (err) {
    log.error('api', 'POST /api/billing/checkout failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// POST /api/billing/portal — Stripe customer portal (manage/cancel subscription)
billingRouter.post('/portal', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!))
    if (!user?.stripeCustomerId) return res.status(400).json({ error: 'No billing account found' })

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${APP_URL}/dashboard/profile`,
    })

    log.info('billing', 'portal session created', { userId: user.id })
    res.json({ url: session.url })
  } catch (err) {
    log.error('api', 'POST /api/billing/portal failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to create portal session' })
  }
})
