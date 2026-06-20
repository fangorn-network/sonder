// ─── Bug reports ──────────────────────────────────────────────────────────────
// In-app "report a problem" plumbing for the early-access preview. The renderer
// collects a short description; main attaches diagnostics (app version, OS,
// recent logs) and files a GitHub issue.
//
// Delivery is deliberately keyless. `.env` ships inside the packaged app and is
// user-editable (see .env.example), so we can't embed a GitHub token. Instead we
// POST to a small serverless proxy that holds the token (VITE_BUGREPORT_ENDPOINT
// → see tools/bug-report-worker). If that endpoint isn't configured or the POST
// fails, we fall back to opening a prefilled GitHub "New issue" page in the
// browser, so the user is never left at a dead end.

import { app, ipcMain, net, shell } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'

const REPO = 'fangorn-network/sonder'
const LABELS = ['bug', 'early-access']

// VITE_* env is injected into the main process too (electron-vite); same pattern
// as the RPC URL in index.ts. Undefined in dev / before the proxy is deployed.
const ENDPOINT = (import.meta as unknown as { env?: Record<string, string | undefined> })
  .env?.VITE_BUGREPORT_ENDPOINT

// ── Ring buffer of recent main-process console output ──────────────────────────
// The app already logs richly with `[tag]` prefixes ([boot], [qdrant], [py], …).
// We tee those into a bounded buffer so a report can carry the last moments
// before something went wrong, without writing anything to disk or phoning home.
const MAX_LOG_LINES = 300
const ring: string[] = []
let captureInstalled = false

export function installLogCapture(): void {
  if (captureInstalled) return
  captureInstalled = true
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      try {
        const line = args.map(a => (typeof a === 'string' ? a : safeStr(a))).join(' ')
        ring.push(`${new Date().toISOString()} [${method}] ${line}`)
        if (ring.length > MAX_LOG_LINES) ring.shift()
      } catch {
        /* logging must never throw */
      }
      original(...args)
    }
  }
}

function safeStr(v: unknown): string {
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  } catch {
    return String(v)
  }
}

// ── Diagnostics ────────────────────────────────────────────────────────────────
export interface Diagnostics {
  appVersion: string
  platform: string
  arch: string
  os: string
  electron: string
  chrome: string
  node: string
}

export function collectDiagnostics(): Diagnostics {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    os: `${os.type()} ${os.release()}`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }
}

// Last ~8KB of the Python backend's stderr (the one log we already persist).
function pyStderrTail(maxBytes = 8000): string {
  try {
    const p = path.join(app.getPath('userData'), 'py-stderr.log')
    const { size } = fs.statSync(p)
    const start = Math.max(0, size - maxBytes)
    const fd = fs.openSync(p, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      return buf.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

function collectLogTail(): string {
  return [
    '── main process ──',
    ring.join('\n') || '(no captured logs)',
    '',
    '── python backend (py-stderr.log tail) ──',
    pyStderrTail() || '(none)',
  ].join('\n')
}

// ── Report assembly ──────────────────────────────────────────────────────────────
export interface BugReportInput {
  description: string
  expected?: string
  email?: string
  userId?: string
}

export interface BugReportResult {
  ok: boolean
  via?: 'api' | 'browser'
  url?: string
  error?: string
}

function buildTitle(description: string): string {
  const first = description.trim().split('\n')[0].slice(0, 80)
  return first ? `[bug] ${first}` : '[bug] (no description)'
}

function buildBody(input: BugReportInput, diag: Diagnostics, logTail: string): string {
  const lines = [
    '### What happened',
    input.description.trim() || '_(none given)_',
    '',
  ]
  if (input.expected?.trim()) {
    lines.push('### What I expected', input.expected.trim(), '')
  }
  lines.push(
    '### Environment',
    `- App: v${diag.appVersion}`,
    `- OS: ${diag.os} (${diag.platform}/${diag.arch})`,
    `- Electron ${diag.electron} · Chrome ${diag.chrome} · Node ${diag.node}`,
    '',
    '### Reporter',
    `- Contact: ${input.email?.trim() || '_(not provided)_'}`,
    `- Account: ${input.userId || '_(signed out)_'}`,
    '',
    '### Recent logs',
    '```',
    logTail,
    '```',
    '',
    '_Filed from the in-app reporter (early access preview)._',
  )
  return lines.join('\n')
}

async function fileViaProxy(
  title: string,
  body: string,
): Promise<BugReportResult | null> {
  if (!ENDPOINT) return null
  try {
    const res = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels: LABELS }),
    })
    if (!res.ok) {
      console.error('[bug-report] proxy responded', res.status)
      return null
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const url = (data.url ?? data.html_url) as string | undefined
    return { ok: true, via: 'api', url }
  } catch (e) {
    console.error('[bug-report] proxy request failed:', e)
    return null
  }
}

// Browser fallback — open GitHub's prefilled "New issue" page. URLs are length
// bounded (encodeURIComponent inflates the payload), so the log tail is trimmed
// hard here; the full tail only travels over the proxy path.
function fileViaBrowser(title: string, body: string): BugReportResult {
  const trimmed =
    body.length > 4000 ? `${body.slice(0, 4000)}\n\n… (logs truncated — see app for full output)` : body
  const url =
    `https://github.com/${REPO}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(trimmed)}` +
    `&labels=${encodeURIComponent(LABELS.join(','))}`
  shell.openExternal(url)
  return { ok: true, via: 'browser' }
}

export async function submitBugReport(input: BugReportInput): Promise<BugReportResult> {
  if (!input?.description?.trim()) {
    return { ok: false, error: 'A description is required.' }
  }
  const diag = collectDiagnostics()
  const body = buildBody(input, diag, collectLogTail())
  const title = buildTitle(input.description)

  const viaProxy = await fileViaProxy(title, body)
  if (viaProxy) return viaProxy
  return fileViaBrowser(title, body)
}

export function registerBugReportIpc(): void {
  ipcMain.handle('bug:diagnostics', () => collectDiagnostics())
  ipcMain.handle('bug:submit', async (_e, input: BugReportInput) => submitBugReport(input))
}
