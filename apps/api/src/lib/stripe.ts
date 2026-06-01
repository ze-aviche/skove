import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

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
