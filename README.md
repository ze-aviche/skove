# Skove

**Agents working for you, 24/7. Results waiting when you wake up.**

Skove is an open agent platform where users deploy autonomous agents that monitor, search, and act on their behalf — continuously, in the background.

## What is Skove?

Unlike a chatbot you have to ask, Skove agents work while you're offline. A flight watcher checks prices every 2 hours and alerts you when they drop. A job tracker monitors listings and drafts applications. A rental scout surfaces new listings the moment they appear. Users come back to a dashboard of results — not a blank prompt.

## Monorepo Structure

```
skove/
├── apps/
│   ├── web/          # Next.js 14 dashboard (user-facing)
│   └── api/          # Node.js + Express backend + agent runner
├── packages/
│   └── sdk/          # Agent SDK for 3rd party developers
├── agents/
│   └── flight-watcher/   # First built-in agent
├── docs/             # Developer documentation
├── docker-compose.yml
└── turbo.json
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Supabase |
| Job Scheduler | Trigger.dev |
| Auth | Clerk |
| Email | Resend |
| Payments | Stripe |
| Deployment | Railway (web + api) |

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 8+
- Docker (for local Postgres)

### Setup

```bash
# Clone the repo
git clone https://github.com/ze-aviche/skove.git
cd skove

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start local services (Postgres)
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

This starts:
- `http://localhost:3000` — Next.js dashboard
- `http://localhost:3001` — API server

## Agent SDK

Any developer can build and publish an agent to the Skove marketplace. See [packages/sdk/README.md](packages/sdk/README.md) for the full spec.

For implementation details, cache behavior, and log search strings for the job tracker ATS flow, see [docs/ats-job-tracker.md](docs/ats-job-tracker.md).

A minimal agent looks like this:

```typescript
import { defineAgent } from '@skove/sdk'

export default defineAgent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'What this agent does for the user',
  configSchema: {
    keyword: { type: 'string', label: 'Search keyword', required: true },
    maxPrice: { type: 'number', label: 'Max price ($)', required: false },
  },
  schedule: '0 */2 * * *', // every 2 hours
  async run(config, ctx) {
    // fetch data, filter, return results
    const results = await fetchSomething(config.keyword)
    return results.filter(r => r.price <= config.maxPrice)
  },
})
```

## Deployment

### API — Railway

The API is deployed on Railway from the repo root. Key configuration:

- **Config file:** `railway.json` at the repo root — Railway must be pointed at `/railway.json` via Settings → Config-as-code
- **Build command:** `pnpm install --prod=false && pnpm --filter api build` — `--prod=false` is required because Railway sets `NODE_ENV=production` during build, which skips devDependencies (including `tsc`) otherwise
- **Start command:** `node --dns-result-order=ipv4first apps/api/dist/index.js`
- **Watch path:** `/apps/api/**`

#### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase **shared pooler** connection string (see below) |
| `CLERK_SECRET_KEY` | Clerk backend secret |
| `RESEND_API_KEY` | Resend email API key |
| `NEXT_PUBLIC_APP_URL` | Frontend URL for CORS |

#### Supabase connection

Supabase's direct connection and dedicated pooler are IPv6-only on the free plan. Railway cannot route IPv6. Use the **shared pooler**:

1. Supabase Dashboard → Settings → Database → Connection string
2. Select **"Supabase Pooler"** (not "Dedicated Pooler")
3. Copy the **Transaction mode** URL — port `6543`, username format `postgres.[project-ref]`
4. Set this as `DATABASE_URL` in Railway

### Web — Railway

The Next.js frontend runs as a separate Railway service. Set `NEXT_PUBLIC_API_URL` to the Railway API service URL and `NEXT_PUBLIC_APP_URL` to `https://skove.app`.

## Contributing

Skove is open to agent contributions. To submit an agent:

1. Fork this repo
2. Build your agent in `agents/your-agent-name/`
3. Follow the [Agent Submission Guide](docs/agent-submission.md)
4. Open a pull request

## Roadmap

- [x] Project scaffold
- [ ] User auth + dashboard
- [ ] Agent runner infrastructure
- [ ] Flight watcher agent (v1)
- [ ] Agent marketplace
- [ ] Developer SDK + docs
- [ ] Stripe billing

## License

MIT
