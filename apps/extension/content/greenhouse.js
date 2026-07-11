// Skove AI Apply — Greenhouse content script.
//
// Runs on Greenhouse-hosted application pages. When the page is opened from the
// Skove dashboard, the apply URL carries a short-lived signed token in its
// fragment (#skove=<token>). This script reads that token, fetches the prepared
// application package from the Skove API, and fills the form — leaving the final
// "Submit application" click to the user.

(function () {
  'use strict'

  const DEFAULT_API_BASE = 'https://api-production-1bae.up.railway.app'

  function getToken() {
    const m = location.hash.match(/skove=([^&]+)/)
    return m ? decodeURIComponent(m[1]) : null
  }

  async function getApiBase() {
    try {
      const stored = await chrome.storage.local.get('apiBase')
      return stored.apiBase || DEFAULT_API_BASE
    } catch {
      return DEFAULT_API_BASE
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fillById(id, value) {
    if (!value) return false
    const el = document.getElementById(id)
    if (el && 'value' in el) { setNativeValue(el, value); return true }
    return false
  }

  // Find a labelled field whose label text loosely matches any of `needles`
  function findFieldByLabel(needles) {
    const labels = Array.from(document.querySelectorAll('label'))
    for (const label of labels) {
      const text = (label.textContent || '').toLowerCase()
      if (needles.some(n => text.includes(n))) {
        const forId = label.getAttribute('for')
        if (forId) {
          const el = document.getElementById(forId)
          if (el) return el
        }
        const nested = label.querySelector('input, textarea, select')
        if (nested) return nested
      }
    }
    return null
  }

  function fillByLabel(needles, value) {
    if (!value) return false
    const el = findFieldByLabel(needles)
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      setNativeValue(el, value)
      return true
    }
    return false
  }

  // Attach a base64 file to the resume file input via a synthetic DataTransfer
  function attachResume(resume) {
    if (!resume || !resume.base64) return false
    const input =
      document.getElementById('resume') ||
      document.querySelector('input[type="file"][name*="resume" i]') ||
      document.querySelector('input[type="file"]')
    if (!input) return false

    try {
      const bytes = Uint8Array.from(atob(resume.base64), c => c.charCodeAt(0))
      const file = new File([bytes], resume.filename || 'resume.pdf', { type: resume.mimeType || 'application/pdf' })
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    } catch (e) {
      console.warn('[Skove] resume attach failed', e)
      return false
    }
  }

  // Best-effort match of screening answers to custom-question textareas/inputs
  function fillScreeningAnswers(answers) {
    let filled = 0
    for (const qa of answers) {
      if (!qa.answer) continue
      const words = qa.question.toLowerCase().split(/\W+/).filter(w => w.length > 4)
      const el = findFieldByLabel(words.slice(0, 3))
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && !el.value) {
        setNativeValue(el, qa.answer)
        filled++
      }
    }
    return filled
  }

  // ── Banner UI ────────────────────────────────────────────────────────────

  function banner(message, tone) {
    let bar = document.getElementById('skove-banner')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = 'skove-banner'
      bar.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;' +
        'font:600 13px system-ui,sans-serif;text-align:center;color:#fff;'
      document.documentElement.appendChild(bar)
    }
    bar.style.background = tone === 'error' ? '#dc2626' : tone === 'success' ? '#16a34a' : '#2563eb'
    bar.textContent = message
  }

  // ── Fill orchestration ───────────────────────────────────────────────────

  function applyPackage(pkg) {
    const f = pkg.fields || {}
    // Greenhouse classic ids first, then label fallback
    fillById('first_name', f.firstName) || fillByLabel(['first name'], f.firstName)
    fillById('last_name', f.lastName) || fillByLabel(['last name'], f.lastName)
    fillById('email', f.email) || fillByLabel(['email'], f.email)
    fillById('phone', f.phone) || fillByLabel(['phone'], f.phone)
    fillByLabel(['linkedin'], f.linkedinUrl)
    fillByLabel(['github'], f.githubUrl)
    fillByLabel(['website', 'portfolio'], f.portfolioUrl)
    fillByLabel(['location', 'city'], f.location)

    const resumeOk = attachResume(pkg.resume)
    const answersFilled = fillScreeningAnswers(pkg.screeningAnswers || [])

    banner(
      `Skove filled your details${resumeOk ? ' + resume' : ''}${answersFilled ? ` + ${answersFilled} answer(s)` : ''}. ` +
      `Review everything, then click Submit. Resume upload${resumeOk ? '' : ' NOT'} attached — re-check before submitting.`,
      'success'
    )
  }

  // Greenhouse's React boards render the form after load — retry until fields appear
  function whenFormReady(cb, attempts = 20) {
    const hasForm =
      document.getElementById('first_name') ||
      document.querySelector('input[type="file"]') ||
      document.querySelector('form')
    if (hasForm) return cb()
    if (attempts <= 0) return banner('Skove: could not find the application form on this page.', 'error')
    setTimeout(() => whenFormReady(cb, attempts - 1), 500)
  }

  async function main() {
    const token = getToken()
    if (!token) return // page opened normally, not via Skove

    banner('Skove is preparing your application…', 'info')
    try {
      const apiBase = await getApiBase()
      const res = await fetch(`${apiBase}/api/apply-fill?token=${encodeURIComponent(token)}`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const pkg = await res.json()
      whenFormReady(() => applyPackage(pkg))
    } catch (e) {
      console.error('[Skove] fill failed', e)
      banner('Skove could not load your application data (token may have expired). Open it again from the dashboard.', 'error')
    }
  }

  main()
})()
