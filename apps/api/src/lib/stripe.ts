import Stripe from 'stripe'

let _stripe: InstanceType<typeof Stripe> | null = null

export function getStripe(): InstanceType<typeof Stripe> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

export { Stripe }

export const PLANS = {
  free: {
    name: 'Free',
    maxAgents: 2,
    priceId: null,
  },
  pro: {
    name: 'Pro',
    maxAgents: Infinity,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
  },
} as const

export type Plan = keyof typeof PLANS
