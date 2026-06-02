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
