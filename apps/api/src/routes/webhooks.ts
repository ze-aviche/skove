import { Router } from 'express'

export const webhooksRouter = Router()

// POST /api/webhooks/clerk — sync user creation from Clerk
webhooksRouter.post('/clerk', async (req, res) => {
  const { type, data } = req.body
  // TODO: verify Clerk webhook signature
  if (type === 'user.created') {
    // sync new user to our DB
    console.log('New user signed up:', data.id)
  }
  res.json({ received: true })
})
