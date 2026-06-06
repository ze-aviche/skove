import { fetchLeverJobs, fetchGreenhouseJobs, fetchAshbyJobs } from './index'

const companies = [
  { name: 'openai', atsIdentifier: 'openai' },
  { name: 'google', atsIdentifier: 'google' },
  { name: 'anthropic', atsIdentifier: 'anthropic' },
]

async function run() {
  console.log('Testing Lever scrapers...')
  const lever = await fetchLeverJobs('software engineer', 'remote', 0, companies)
  console.log('Lever results:', lever.length)
  console.log(lever.slice(0, 5))

  console.log('\nTesting Greenhouse scrapers...')
  const greenhouse = await fetchGreenhouseJobs('software engineer', 'remote', 0, companies)
  console.log('Greenhouse results:', greenhouse.length)
  console.log(greenhouse.slice(0, 5))

  console.log('\nTesting Ashby scrapers...')
  const ashby = await fetchAshbyJobs('software engineer', 'remote', 0, companies)
  console.log('Ashby results:', ashby.length)
  console.log(ashby.slice(0, 5))
}

run().catch((error) => {
  console.error('Test failed:', error)
  process.exit(1)
})
