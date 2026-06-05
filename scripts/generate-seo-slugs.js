const fs = require('fs')
const path = require('path')

// Generates many SEO slugs by combining roles, locations, and modifiers.
const roles = [
  'aws',
  'amazon-connect',
  'genai',
  'python',
  'devops',
  'react',
  'terraform',
  'site-reliability-engineer',
  'backend-engineer',
]

const locations = [
  'remote',
  'dallas',
  'austin',
  'san-francisco',
  'new-york',
  'seattle',
  'boston',
]

const seniorities = ['', 'senior', 'lead', 'principal']

function slugify(parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .toLowerCase()
}

const set = new Set();

// seed with focused slugs from product team
;['aws-connect','genai','python','devops','react','terraform','dallas-aws-jobs','remote-aws-jobs','senior-aws-jobs','amazon-connect-jobs'].forEach(s=>set.add(s))

for (const role of roles) {
  for (const location of locations) {
    for (const senior of seniorities) {
      const parts = [role, senior, location]
      const s = slugify(parts)
      set.add(s)
    }
    // also add role-location without senior
    set.add(slugify([role, location]))
  }
  // related generic pages
  set.add(slugify([role, 'jobs']))
  set.add(slugify(['remote', role, 'jobs']))
}

// write to apps/web/data/seo-slugs.json
const outPath = path.join(process.cwd(), 'apps/web/data/seo-slugs.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(Array.from(set).sort(), null, 2), 'utf8')
console.log('Wrote', outPath, 'with', set.size, 'slugs')
