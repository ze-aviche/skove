import { Request, Response, NextFunction } from 'express'
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node'

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  ClerkExpressRequireAuth()(req, res, (err) => {
    if (err) return res.status(401).json({ error: 'Unauthorized' })
    req.userId = (req as any).auth?.userId
    next()
  })
}
