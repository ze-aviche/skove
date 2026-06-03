import { authMiddleware } from '@clerk/nextjs'

export default authMiddleware({
  publicRoutes: ['/', '/sign-in', '/sign-in/(.*)', '/sign-up', '/sign-up/(.*)', '/terms', '/privacy'],
  // /admin requires auth — unauthenticated requests redirect to sign-in automatically
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
