import { auth } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const { userId } = auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900">skove</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { label: 'Dashboard', href: '/dashboard', active: true },
            { label: 'My agents', href: '/dashboard/agents' },
            { label: 'Results', href: '/dashboard/results' },
            { label: 'Alerts', href: '/dashboard/alerts' },
            { label: 'Agent store', href: '/dashboard/store' },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
                item.active
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="ml-56 p-8">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active agents', value: '0' },
            { label: 'Results found', value: '0' },
            { label: 'Alerts sent', value: '0' },
            { label: 'Hours saved', value: '0h' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
              <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Empty state — no agents yet */}
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <div className="text-base font-medium text-gray-900 mb-2">No agents running yet</div>
          <div className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            Browse the agent store and deploy your first agent. It'll start working immediately.
          </div>
          <a
            href="/dashboard/store"
            className="inline-flex items-center bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Browse agent store →
          </a>
        </div>
      </div>
    </div>
  )
}
