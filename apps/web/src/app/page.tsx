import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="text-xl font-semibold tracking-tight">skove</span>
        <div className="flex items-center gap-4">
          <SignedOut>
            <Link href="/sign-in" className="text-sm text-gray-500 hover:text-gray-900">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Get started
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Dashboard
            </Link>
          </SignedIn>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1 rounded-full mb-6 border border-brand-100">
          <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
          Agents running 24/7
        </div>
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900 mb-6 leading-tight">
          Stop checking.<br />Start receiving.
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          Skove agents monitor flights, jobs, rentals, and more — continuously, 
          in the background. Results waiting when you wake up.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="bg-gray-900 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Start for free
          </Link>
          <Link
            href="https://github.com/ze-aviche/skove"
            target="_blank"
            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1.5"
          >
            View on GitHub →
          </Link>
        </div>
      </section>

      {/* Agent cards preview */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '✈️', name: 'Flight watcher', desc: 'Monitors your route every 2 hrs. Alerts when price drops below your limit.' },
            { icon: '💼', name: 'Job tracker', desc: 'Watches listings matching your criteria. Drafts applications while you sleep.' },
            { icon: '🏠', name: 'Rental scout', desc: 'Surfaces new listings the moment they appear. Never miss a great apartment.' },
          ].map((agent) => (
            <div key={agent.name} className="border border-gray-100 rounded-xl p-5 bg-gray-50">
              <div className="text-2xl mb-3">{agent.icon}</div>
              <div className="text-sm font-medium text-gray-900 mb-1">{agent.name}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{agent.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
