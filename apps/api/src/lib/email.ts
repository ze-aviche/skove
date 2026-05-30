import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM || 'Skove <hello@skove.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function isConfigured() {
  const key = process.env.RESEND_API_KEY
  return key && key !== 're_...'
}

export interface AlertResult {
  title: string
  value?: string | null
  url?: string | null
}

export async function sendAlertEmail(to: string, agentName: string, results: AlertResult[]) {
  if (!isConfigured()) {
    console.log(`[email] RESEND_API_KEY not set — skipping alert to ${to}`)
    return
  }

  const subject = results.length === 1
    ? `${agentName} found: ${results[0].title}`
    : `${agentName} found ${results.length} new results`

  const resultsHtml = results.map((r) => `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="font-size:14px;font-weight:500;color:#f8fafc;margin-bottom:4px;">${r.title}</div>
      ${r.value ? `<div style="font-size:22px;font-weight:700;color:#8b5cf6;margin-bottom:8px;">${r.value}</div>` : ''}
      ${r.url ? `<a href="${r.url}" style="font-size:12px;color:#8b5cf6;text-decoration:none;">View →</a>` : ''}
    </div>
  `).join('')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.05em;color:#f8fafc;">Skove</span>
      </div>
      <h2 style="font-size:18px;font-weight:600;color:#f8fafc;margin:0 0 6px 0;">Your ${agentName} found something</h2>
      <p style="font-size:13px;color:#94a3b8;margin:0 0 24px 0;">
        ${results.length} new result${results.length !== 1 ? 's' : ''} waiting for you.
      </p>
      ${resultsHtml}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #334155;">
        <a href="${APP_URL}/dashboard/results"
           style="display:inline-block;background:#8b5cf6;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;">
          View in dashboard →
        </a>
      </div>
      <p style="font-size:11px;color:#475569;margin-top:20px;">Sent by Skove · Agents working for you, 24/7.</p>
    </div>
  `

  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) {
    console.error(`[email] Alert failed (${to}):`, JSON.stringify(error))
    return
  }
  console.log(`[email] Alert sent to ${to} — id: ${data?.id}`)
}

export interface DigestItem {
  agentName: string
  title: string
  value?: string | null
  url?: string | null
}

export async function sendDailyDigest(to: string, items: DigestItem[]) {
  if (!isConfigured()) {
    console.log(`[email] RESEND_API_KEY not set — skipping digest to ${to}`)
    return
  }
  if (items.length === 0) return

  const subject = `Your morning digest — ${items.length} update${items.length !== 1 ? 's' : ''} from your agents`

  const itemsHtml = items.map((item) => `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="font-size:10px;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.07em;">${item.agentName}</div>
      <div style="font-size:14px;font-weight:500;color:#f8fafc;margin-bottom:4px;">${item.title}</div>
      ${item.value ? `<div style="font-size:22px;font-weight:700;color:#8b5cf6;margin-bottom:6px;">${item.value}</div>` : ''}
      ${item.url ? `<a href="${item.url}" style="font-size:12px;color:#8b5cf6;text-decoration:none;">View →</a>` : ''}
    </div>
  `).join('')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.05em;color:#f8fafc;">Skove</span>
      </div>
      <h2 style="font-size:18px;font-weight:600;color:#f8fafc;margin:0 0 6px 0;">Good morning ☀️</h2>
      <p style="font-size:13px;color:#94a3b8;margin:0 0 24px 0;">
        Here's what your agents found while you were away.
      </p>
      ${itemsHtml}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #334155;">
        <a href="${APP_URL}/dashboard"
           style="display:inline-block;background:#8b5cf6;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;">
          Open dashboard →
        </a>
      </div>
      <p style="font-size:11px;color:#475569;margin-top:20px;">Sent by Skove · Agents working for you, 24/7.</p>
    </div>
  `

  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) {
    console.error(`[email] Digest failed (${to}):`, JSON.stringify(error))
    return
  }
  console.log(`[email] Digest sent to ${to} — id: ${data?.id}`)
}
