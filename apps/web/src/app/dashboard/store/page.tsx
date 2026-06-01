import { getAgentDefinitions, AgentDefinition } from '@/lib/api'
import dynamic from 'next/dynamic'

const DeployButton = dynamic(() => import('@/components/DeployButton'), { ssr: false })

const categories = ['All', 'Travel', 'Jobs', 'Real Estate', 'Finance', 'News']

type StoreAgent = AgentDefinition & {
  icon: string
  category: string
  users: string
  status: 'official'
}

async function getStoreAgents() {
  try {
    const agents = await getAgentDefinitions()
    return agents.map((agent) => ({
      ...agent,
      icon: '🤖',
      category: agent.configSchema['category'] ? String(agent.configSchema['category']) : 'Custom',
      users: '–',
      status: 'official' as const,
    })) as StoreAgent[]
  } catch (error) {
    console.error('Failed to load store agents:', error)
    return []
  }
}

export default async function AgentStorePage() {
  const storeAgents = await getStoreAgents()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
          Agent store
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Deploy an agent in 30 seconds. It starts working immediately.
        </p>
      </div>

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {categories.map((cat, i) => (
          <button key={cat} style={{
            fontSize: 12, fontWeight: 500,
            padding: '6px 14px', borderRadius: 99,
            border: `1px solid ${i === 0 ? 'var(--brand)' : 'var(--border)'}`,
            background: i === 0 ? 'var(--brand-dim)' : 'var(--surface-2)',
            color: i === 0 ? 'var(--brand)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}>{cat}</button>
        ))}
      </div>

      {/* Agent grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {storeAgents.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No agents are available right now. Please check your API connection or seed the database.
          </div>
        ) : storeAgents.map((agent) => (
          <div key={agent.id} style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            transition: 'border-color 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 40, height: 40,
                background: 'var(--surface-3)',
                borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>{agent.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500,
                    padding: '1px 7px', borderRadius: 99,
                    background: agent.status === 'official' ? 'var(--brand-dim)' : 'var(--surface-4)',
                    color: agent.status === 'official' ? 'var(--brand)' : 'var(--text-secondary)',
                    border: `1px solid ${agent.status === 'official' ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                  }}>{agent.status === 'official' ? '⬡ Official' : '◈ Community'}</span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 7px', borderRadius: 99,
                    background: 'var(--surface-4)',
                    color: 'var(--text-tertiary)',
                    border: '1px solid var(--border)',
                  }}>{agent.category}</span>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              {agent.description}
            </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  👤 {agent.users} users
                </span>
                <div style={{ marginLeft: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <DeployButton agent={{ id: agent.id, name: agent.name, configSchema: agent.configSchema }} />
                </div>
              </div>
          </div>
        ))}

        {/* Submit your own */}
        <div style={{
          background: 'var(--surface-2)',
          border: '1px dashed var(--border)',
          borderRadius: 14,
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          textAlign: 'center',
          minHeight: 180,
        }}>
          <div style={{ fontSize: 28 }}>🛠️</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Build your own agent</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, maxWidth: 180 }}>
            Use the Skove SDK to build and publish agents for the marketplace
          </div>
          <a href="https://github.com/ze-aviche/skove/blob/main/docs/agent-submission.md"
            target="_blank"
            style={{
              fontSize: 12, fontWeight: 500,
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-3)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              textDecoration: 'none',
            }}>Read the docs →</a>
        </div>
      </div>
    </div>
  )
}
