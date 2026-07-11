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

  // ── <select> dropdown helpers ─────────────────────────────────────────────

  function selectIsEmpty(select) {
    return !select.value || select.value === ''
  }

  // Pick the option that best matches `desired` and select it
  function selectOption(select, desired) {
    if (!desired) return false
    const want = String(desired).trim().toLowerCase()
    if (!want) return false
    const opts = Array.from(select.options)

    const norm = s => (s || '').trim().toLowerCase()
    const match =
      // exact value or visible-text match
      opts.find(o => norm(o.value) === want || norm(o.textContent) === want) ||
      // option text contains the desired value
      opts.find(o => want.length > 1 && norm(o.textContent).includes(want)) ||
      // desired value contains the option text (e.g. long EEO strings)
      opts.find(o => norm(o.textContent).length > 2 && want.includes(norm(o.textContent))) ||
      // yes/no leading match
      ((want === 'yes' || want === 'no') ? opts.find(o => norm(o.textContent).startsWith(want)) : null)

    if (!match) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    if (setter) setter.call(select, match.value)
    else select.value = match.value
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  function fillSelectByLabel(needles, desired) {
    if (!desired) return false
    const el = findFieldByLabel(needles)
    if (el && el.tagName === 'SELECT') return selectOption(el, desired)
    return false
  }

  // ── Radio-group helpers ───────────────────────────────────────────────────

  // Radios for one question share a `name`. Find the group associated with a
  // question label, and select the radio whose own label text matches `desired`.
  function radioGroupForQuestion(label) {
    // Radios usually sit in the same fieldset/container as the question text
    let scope = label.closest('fieldset') || label.parentElement
    for (let hop = 0; hop < 3 && scope; hop++) {
      const radios = scope.querySelectorAll('input[type="radio"]')
      if (radios.length) return Array.from(radios)
      scope = scope.parentElement
    }
    return []
  }

  function radioLabelText(radio) {
    if (radio.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)
      if (lbl) return lbl.textContent.trim()
    }
    const wrap = radio.closest('label')
    if (wrap) return wrap.textContent.trim()
    const sib = radio.nextElementSibling
    return sib ? sib.textContent.trim() : (radio.value || '')
  }

  function selectRadio(radios, desired) {
    if (!desired || !radios.length) return false
    const want = String(desired).trim().toLowerCase()
    const norm = s => (s || '').trim().toLowerCase()
    const match =
      radios.find(r => norm(radioLabelText(r)) === want || norm(r.value) === want) ||
      radios.find(r => want.length > 1 && norm(radioLabelText(r)).includes(want)) ||
      ((want === 'yes' || want === 'no') ? radios.find(r => norm(radioLabelText(r)).startsWith(want)) : null)
    if (!match) return false
    match.checked = true
    match.dispatchEvent(new Event('input', { bubbles: true }))
    match.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  function labelMatching(needles) {
    return Array.from(document.querySelectorAll('label, legend')).find(l => {
      const t = (l.textContent || '').toLowerCase()
      return needles.some(n => t.includes(n))
    })
  }

  // Fill a question that is either a <select> or a radio group, by label
  function fillChoiceByLabel(needles, desired) {
    if (!desired) return false
    if (fillSelectByLabel(needles, desired)) return true
    const q = labelMatching(needles)
    if (q) {
      const radios = radioGroupForQuestion(q)
      if (radios.length && selectRadio(radios, desired)) return true
    }
    return false
  }

  // Attach a base64 file to a file input via a synthetic DataTransfer
  function attachFile(input, fileData, fallbackName) {
    if (!input || !fileData || !fileData.base64) return false
    try {
      const bytes = Uint8Array.from(atob(fileData.base64), c => c.charCodeAt(0))
      const file = new File([bytes], fileData.filename || fallbackName, { type: fileData.mimeType || 'application/pdf' })
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    } catch (e) {
      console.warn('[Skove] file attach failed', e)
      return false
    }
  }

  // Find a file input near a label matching any needle
  function fileInputByLabel(needles) {
    const el = findFieldByLabel(needles)
    if (el && el.tagName === 'INPUT' && el.type === 'file') return el
    // fall back to a file input whose id/name contains a needle
    for (const inp of Array.from(document.querySelectorAll('input[type="file"]'))) {
      const hay = `${inp.id} ${inp.name}`.toLowerCase()
      if (needles.some(n => hay.includes(n.replace(/\s+/g, '_')) || hay.includes(n.replace(/\s+/g, '')))) return inp
    }
    return null
  }

  function attachResume(resume) {
    const input =
      document.getElementById('resume') ||
      document.querySelector('input[type="file"][name*="resume" i]') ||
      fileInputByLabel(['resume', 'cv']) ||
      document.querySelector('input[type="file"]')
    return attachFile(input, resume, 'resume.pdf')
  }

  // Fill the cover letter: paste text into a cover-letter textarea if present,
  // and attach the rendered PDF to a cover-letter file input if present.
  function fillCoverLetter(pkg) {
    let done = false
    if (pkg.coverLetter) {
      const ta = findFieldByLabel(['cover letter'])
      if (ta && ta.tagName === 'TEXTAREA' && !ta.value) { setNativeValue(ta, pkg.coverLetter); done = true }
    }
    if (pkg.coverLetterFile) {
      const input =
        document.getElementById('cover_letter') ||
        fileInputByLabel(['cover letter'])
      // avoid grabbing the resume input by accident
      if (input && input !== document.getElementById('resume')) {
        if (attachFile(input, pkg.coverLetterFile, 'cover_letter.pdf')) done = true
      }
    }
    return done
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

  const PERSONAL_IDS = new Set(['first_name', 'last_name', 'email', 'phone'])

  // Find question fields still empty after the known package was applied — these
  // are the "arbitrary" questions we send back to the AI to answer live.
  function collectUnfilledQuestions() {
    const found = []
    const seen = new Set()
    for (const label of Array.from(document.querySelectorAll('label'))) {
      const text = (label.textContent || '').replace(/\s+/g, ' ').trim()
      // Heuristic: a real question is a longish label or ends with "?"
      if (text.length < 8) continue
      if (!(text.includes('?') || text.length > 25)) continue

      let el = null
      const forId = label.getAttribute('for')
      if (forId) el = document.getElementById(forId)
      if (!el) el = label.querySelector('textarea, select, input[type="text"], input:not([type])')
      if (!el) continue
      if (el.id && PERSONAL_IDS.has(el.id)) continue

      const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === ''))
      const isSelect = el.tagName === 'SELECT'
      if (!isText && !isSelect) continue
      if (isText && el.value && el.value.trim()) continue
      if (isSelect && !selectIsEmpty(el)) continue
      if (seen.has(el)) continue

      const options = el.tagName === 'SELECT'
        ? Array.from(el.options).map(o => o.textContent.trim()).filter(t => t && !/^(select|choose|--)/i.test(t))
        : null

      seen.add(el)
      found.push({ question: text.replace(/\*+$/, '').trim(), el, options })
    }
    return found.concat(collectRadioQuestions())
  }

  function radioQuestionText(radios) {
    const fs = radios[0].closest('fieldset')
    if (fs) { const lg = fs.querySelector('legend'); if (lg && lg.textContent.trim()) return lg.textContent.trim() }
    const alb = radios[0].getAttribute('aria-labelledby')
    if (alb) { const el = document.getElementById(alb); if (el && el.textContent.trim()) return el.textContent.trim() }
    // Walk up looking for a question-like text that isn't one of the option labels
    const optionTexts = new Set(radios.map(r => (radioLabelText(r) || '').trim()))
    let node = radios[0].closest('div, li, fieldset, section')
    for (let i = 0; i < 4 && node; i++) {
      const cand = Array.from(node.querySelectorAll('label, legend, span, div, p'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim())
        .find(t => (t.includes('?') || t.length > 25) && t.length < 300 && !optionTexts.has(t))
      if (cand) return cand
      node = node.parentElement
    }
    return ''
  }

  // Unanswered radio-group questions (grouped by name), with their option labels
  function collectRadioQuestions() {
    const groups = {}
    document.querySelectorAll('input[type="radio"]').forEach(r => {
      const key = r.name || ''
      if (!key) return
      ;(groups[key] = groups[key] || []).push(r)
    })
    const out = []
    for (const radios of Object.values(groups)) {
      if (radios.some(r => r.checked)) continue
      const q = radioQuestionText(radios)
      if (!q || q.length < 8) continue
      const options = radios.map(radioLabelText).filter(Boolean)
      out.push({ question: q.replace(/\*+$/, '').trim(), radios, options })
    }
    return out
  }

  async function fillArbitraryQuestions(ctx) {
    const pending = collectUnfilledQuestions()
    if (pending.length === 0) return 0
    try {
      // For dropdowns, tell the AI the exact allowed choices so it returns one
      const questions = pending.map(p =>
        p.options && p.options.length
          ? `${p.question} (choose exactly one of: ${p.options.join(' | ')})`
          : p.question
      )
      const res = await fetch(`${ctx.apiBase}/api/apply-fill/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ctx.token, questions }),
      })
      if (!res.ok) return 0
      const { answers } = await res.json()
      let filled = 0
      ;(answers || []).forEach((a, i) => {
        const target = pending[i]
        if (!target || !a || !a.answer) return
        if (target.radios) {
          if (selectRadio(target.radios, a.answer)) filled++
        } else if (target.el && target.el.tagName === 'SELECT') {
          if (selectOption(target.el, a.answer)) filled++
        } else if (target.el && !target.el.value) {
          setNativeValue(target.el, a.answer)
          filled++
        }
      })
      return filled
    } catch (e) {
      console.warn('[Skove] dynamic answer failed', e)
      return 0
    }
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

  async function applyPackage(pkg, ctx) {
    const f = pkg.fields || {}
    // Greenhouse classic ids first, then label fallback
    fillById('first_name', f.firstName) || fillByLabel(['first name'], f.firstName)
    fillById('last_name', f.lastName) || fillByLabel(['last name'], f.lastName)
    fillById('email', f.email) || fillByLabel(['email'], f.email)
    // Phone: id, label, then any tel input
    if (f.phone) {
      const phoneEl = document.getElementById('phone') || findFieldByLabel(['phone']) || document.querySelector('input[type="tel"]')
      if (phoneEl && (phoneEl.tagName === 'INPUT') && !phoneEl.value) setNativeValue(phoneEl, f.phone)
    }
    fillByLabel(['linkedin'], f.linkedinUrl)
    fillByLabel(['github'], f.githubUrl)
    fillByLabel(['website', 'portfolio'], f.portfolioUrl)
    // Location — prefer a "city and state" style field; f.location now carries currentLocation
    fillByLabel(['city and state', 'current location', 'location', 'city'], f.location)

    // Known EEO / demographic dropdowns AND radio groups from the profile
    const d = pkg.demographics || {}
    const sponsorAns = d.needsSponsorship === true ? 'yes' : d.needsSponsorship === false ? 'no' : ''
    fillChoiceByLabel(['gender'], d.gender)
    fillChoiceByLabel(['race'], d.race)
    fillChoiceByLabel(['hispanic', 'latino'], d.hispanicLatino)
    fillChoiceByLabel(['veteran'], d.veteranStatus)
    fillChoiceByLabel(['disability'], d.disabilityStatus)
    fillChoiceByLabel(['authorized', 'work authorization', 'legally authorized'], d.workAuthorization)
    fillChoiceByLabel(['sponsorship', 'visa', 'immigration'], sponsorAns)
    fillChoiceByLabel(['bay area'], d.locatedBayArea)

    const resumeOk = attachResume(pkg.resume)
    fillCoverLetter(pkg)
    let answersFilled = fillScreeningAnswers(pkg.screeningAnswers || [])

    banner('Skove filled your details — answering the remaining questions with AI…', 'info')
    answersFilled += await fillArbitraryQuestions(ctx)

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
      whenFormReady(() => applyPackage(pkg, { token, apiBase }))
    } catch (e) {
      console.error('[Skove] fill failed', e)
      banner('Skove could not load your application data (token may have expired). Open it again from the dashboard.', 'error')
    }
  }

  main()
})()
