import { authMiddleware } from '@clerk/nextjs'

export default authMiddleware({
  // Public routes — no auth required
  publicRoutes: ['/', '/sign-in(.*)', '/sign-up(.*)'],
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
