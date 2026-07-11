# Skove AI Apply — browser extension

Auto-fills Greenhouse job application forms from your Skove application package,
so you only have to review and click **Submit**.

## How it works

1. In the Skove dashboard, click **⚡ AI Apply** on a job, review/edit the fields,
   then click **Pre-fill application form**.
2. Skove mints a short-lived signed token and opens the ATS apply URL with the
   token in the fragment (`…#skove=<token>`).
3. This extension's content script reads the token, fetches your prepared package
   from `GET /api/apply-fill?token=…`, and fills the form (personal fields,
   screening answers, and your stored resume file).
4. A banner confirms what was filled. **You review and submit** — nothing is
   submitted automatically.

## Load it (developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `apps/extension/` folder.
4. (Optional) Click the extension icon and set the API base URL if you're not
   using the default production API.

## Scope / limitations (MVP)

- **Greenhouse only** so far (`boards.greenhouse.io`, `job-boards.greenhouse.io`).
  Lever/Ashby/Workday are future work — the backend package is ATS-agnostic; only
  the per-ATS content script is missing.
- Resume attachment uses a synthetic file drop. Greenhouse's S3 uploader usually
  accepts it, but **always confirm the resume attached before submitting.**
- Custom screening questions are matched to answers by label text (best-effort);
  double-check them.
- The fill token expires after 15 minutes.
