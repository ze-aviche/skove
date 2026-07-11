import crypto from 'crypto'

// Short-lived, signed tokens that let the browser extension fetch a prepared
// application package for autofill without a Clerk session. The token is placed
// in the ATS apply URL fragment; the content script reads it and calls the
// public /api/apply-fill endpoint. Falls back to CLERK_SECRET_KEY so a dedicated
// secret is optional in dev, but FILL_TOKEN_SECRET should be set in production.
const SECRET = process.env.FILL_TOKEN_SECRET || process.env.CLERK_SECRET_KEY || 'dev-insecure-fill-secret'
const TTL_MS = 15 * 60 * 1000 // 15 minutes

interface FillTokenPayload {
  applicationId: string
  userId: string
  exp: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function signFillToken(applicationId: string, userId: string): string {
  const payload: FillTokenPayload = { applicationId, userId, exp: Date.now() + TTL_MS }
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyFillToken(token: string): FillTokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  // Constant-time compare — both are equal-length base64url of a sha256 digest
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as FillTokenPayload
    if (!payload.applicationId || !payload.userId || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
