# Building a Skove Agent

Anyone can submit an agent to the Skove marketplace. This guide covers everything you need.

## Quick start

```bash
# Copy the example agent
cp -r agents/flight-watcher agents/my-agent
cd agents/my-agent
```

## Agent structure

Every agent is a single TypeScript file that exports a `defineAgent()` call:

```typescript
import { defineAgent } from '@skove/sdk'

export default defineAgent({
  id: 'my-agent',           // unique slug, lowercase, hyphens only
  name: 'My Agent',         // display name in the marketplace
  description: '...',       // one sentence, what it does for the user
  icon: '🔍',              // emoji shown in the UI
  category: 'custom',       // travel | jobs | real-estate | finance | news | custom

  // Fields the user fills in when configuring this agent
  configSchema: {
    keyword: {
      type: 'string',
      label: 'Search keyword',
      required: true,
    },
    maxPrice: {
      type: 'number',
      label: 'Max price ($)',
      required: false,
    },
  },

  // Cron expression — how often the agent runs
  // "0 */2 * * *"  = every 2 hours
  // "0 9 * * *"    = every day at 9am
  // "*/30 * * * *" = every 30 minutes
  schedule: '0 */2 * * *',

  async run(config, ctx) {
    ctx.log(`Running with keyword: ${config.keyword}`)

    // Do your work here — fetch APIs, scrape, filter
    const results = await fetchSomething(config.keyword)

    // Return an array of results
    return results.map(item => ({
      title: item.name,        // required — shown in dashboard
      value: `$${item.price}`, // optional — highlighted number
      url: item.link,          // optional — "View" button in dashboard
      metadata: item,          // optional — any extra data to store
    }))
  },
})
```

## Rules

- Agents must return results, not side effects (no auto-buying, no auto-applying)
- Agents must not collect user credentials or sensitive data
- Agents must not scrape sites that prohibit it in their ToS
- Schedule must be no faster than every 30 minutes
- Each run must complete in under 30 seconds

## Submitting your agent

1. Build and test your agent locally
2. Fork this repo
3. Add your agent to `agents/your-agent-name/`
4. Open a pull request with a description of what it does
5. We'll review and publish it to the marketplace

## Getting paid

Paid agents earn 70% of subscription revenue from users who install them. Set up your payout details in your developer profile after your first agent is approved.
