import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
