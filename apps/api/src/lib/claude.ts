import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface TailoredResumeResult {
  tailoredText: string  // full resume as plain text, sections separated by \n\n
}


export interface JobMatchResult {
  score: number        // 1-10
  reasoning: string   // 2-3 sentences on fit
  coverLetter: string // tailored cover letter
}

export async function scoreJobMatch(
  resumeText: string,
  job: { title: string; company: string; location: string; description?: string; salary?: string }
): Promise<JobMatchResult> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a job application assistant. Evaluate how well this resume matches the job listing.

RESUME (truncated):
${resumeText.slice(0, 3000)}

JOB LISTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${job.salary ? `Salary: ${job.salary}` : ''}
${job.description ? `Description: ${job.description.slice(0, 800)}` : ''}

Respond with ONLY valid JSON, no markdown:
{
  "score": <integer 1-10>,
  "reasoning": "<2-3 sentences explaining the match quality>",
  "coverLetter": "<professional 3-paragraph cover letter tailored to this specific role and company>"
}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned invalid response')
  return JSON.parse(jsonMatch[0]) as JobMatchResult
}

export interface ApplyProfile {
  firstName?: string | null
  lastName?: string | null
  preferredFirstName?: string | null
  preferredLastName?: string | null
  initials?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  country?: string | null
  currentLocation?: string | null
  workAuthorization?: string | null
  needsSponsorship?: boolean | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  portfolioUrl?: string | null
  gender?: string | null
  race?: string | null
  hispanicLatino?: string | null
  veteranStatus?: string | null
  disabilityStatus?: string | null
  aiUsage?: string | null
  locatedBayArea?: string | null
}

export interface ApplyPackageResult {
  fields: {
    firstName: string
    lastName: string
    email: string
    phone: string
    location: string
    linkedinUrl: string
    githubUrl: string
    portfolioUrl: string
    workAuthorization: string
    needsSponsorship: boolean
  }
  screeningAnswers: Array<{ question: string; answer: string }>
  coverLetter: string
}

// Assemble a review-ready application package from the applicant profile + resume + job.
// The profile is the source of truth for identity fields; the LLM only drafts the
// cover letter and answers to common screening questions — it must not invent facts.
export async function buildApplyPackage(
  profile: ApplyProfile,
  resumeText: string,
  job: { title: string; company: string; location: string; description?: string; salary?: string }
): Promise<ApplyPackageResult> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are a job application assistant. Draft answers to the standard screening questions an ATS asks, and a cover letter, for this candidate applying to this role. Base every answer strictly on the profile and resume — never invent employers, dates, credentials, or personal details.

CANDIDATE PROFILE (authoritative for personal facts):
${JSON.stringify(profile)}

RESUME (truncated):
${resumeText.slice(0, 3000)}

JOB LISTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${job.salary ? `Salary: ${job.salary}` : ''}
${job.description ? `Description: ${job.description.slice(0, 1200)}` : ''}

Produce 3-6 screening answers for questions this specific job likely asks (e.g. "Why do you want to work here?", "Years of experience with X", "Are you authorized to work in this country?", "Do you require sponsorship?", "Notice period"). Use the profile's work authorization and sponsorship fields for those questions. If a factual answer is unknown, use an empty string rather than guessing.

Respond with ONLY valid JSON, no markdown:
{
  "screeningAnswers": [ { "question": "<question>", "answer": "<answer, or empty string if unknown>" } ],
  "coverLetter": "<professional 3-paragraph cover letter tailored to this role and company>"
}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned invalid response')
  const parsed = JSON.parse(jsonMatch[0]) as { screeningAnswers?: Array<{ question: string; answer: string }>; coverLetter?: string }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  return {
    fields: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      location: [profile.city, profile.country].filter(Boolean).join(', '),
      linkedinUrl: profile.linkedinUrl ?? '',
      githubUrl: profile.githubUrl ?? '',
      portfolioUrl: profile.portfolioUrl ?? '',
      workAuthorization: profile.workAuthorization ?? '',
      needsSponsorship: Boolean(profile.needsSponsorship),
    },
    screeningAnswers: Array.isArray(parsed.screeningAnswers) ? parsed.screeningAnswers : [],
    coverLetter: parsed.coverLetter ?? '',
  }
}

export async function tailorResume(
  resumeText: string,
  job: { title: string; company: string; location: string; description?: string; salary?: string }
): Promise<TailoredResumeResult> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are a professional resume writer. Tailor the resume below for the specific job listing.

STRICT RULES — follow exactly:
1. Copy every job title, company name, and date range from the original resume VERBATIM — do not rename, reorder, add, or remove any past role
2. Rewrite ONLY the bullet points under each role to highlight responsibilities and achievements most relevant to the target job
3. Rewrite the Summary section to align with the target role
4. Update the Skills section to lead with skills that match the job description; you may add keywords the candidate plausibly has based on their experience, but do not invent technologies or credentials not evidenced in the original
5. Do NOT invent any experience, job titles, companies, dates, degrees, or certifications
6. Plain text only — no markdown, no bold/italic; use dashes (-) for bullet points
7. Separate each major section with a blank line
8. Section headers in ALL CAPS on their own line
9. Format each experience item as: "Job Title at Company (Date Range)" then bullet lines starting with "- "

ORIGINAL RESUME:
${resumeText.slice(0, 6000)}

JOB LISTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${job.salary ? `Salary: ${job.salary}` : ''}
${job.description ? `Description: ${job.description.slice(0, 1500)}` : ''}

Return ONLY the tailored resume text, nothing else.`,
    }],
  })

  const tailoredText = message.content[0].type === 'text' ? message.content[0].text.trim() : resumeText
  return { tailoredText }
}
