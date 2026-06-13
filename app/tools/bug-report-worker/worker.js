/**
 * Bug-report proxy — Cloudflare Worker.
 *
 * The Sond3r app can't ship a GitHub token (its .env is bundled and user
 * editable), so the in-app reporter POSTs here and this Worker — which holds the
 * token as an encrypted secret — files the issue on GitHub.
 *
 * Request  (POST, application/json):
 *   { "title": string, "body": string, "labels"?: string[] }
 * Response (200, application/json):
 *   { "url": string, "number": number }
 *
 * Secrets / vars (set with `wrangler secret put` / in the dashboard):
 *   GITHUB_TOKEN  — fine-grained PAT with Issues: Read & Write on the repo only
 *   GITHUB_REPO   — "owner/name" (defaults to fangorn-network/sonder)
 */

const DEFAULT_REPO = 'fangorn-network/sonder'
const MAX_TITLE = 256
const MAX_BODY = 60_000 // GitHub's hard limit on issue bodies is 65536 chars

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const title = String(payload?.title ?? '').trim().slice(0, MAX_TITLE)
    const body = String(payload?.body ?? '').slice(0, MAX_BODY)
    const labels = Array.isArray(payload?.labels)
      ? payload.labels.filter(l => typeof l === 'string').slice(0, 10)
      : undefined

    if (!title) return json({ error: 'Missing title' }, 400)
    if (!env.GITHUB_TOKEN) return json({ error: 'Server not configured' }, 500)

    const repo = env.GITHUB_REPO || DEFAULT_REPO
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sonder-bug-report-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels }),
    })

    if (!ghRes.ok) {
      const detail = await ghRes.text()
      return json({ error: 'GitHub rejected the issue', status: ghRes.status, detail }, 502)
    }

    const issue = await ghRes.json()
    return json({ url: issue.html_url, number: issue.number }, 201)
  },
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
