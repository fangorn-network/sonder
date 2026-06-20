/**
 * BugReportModal.tsx
 *
 * In-app "report a problem" form for the early-access preview. The user writes
 * what happened; main (bug-report.ts) attaches diagnostics + recent logs and
 * files a GitHub issue — silently via the serverless proxy when configured, or
 * by opening a prefilled GitHub issue in the browser as a fallback.
 *
 * Privy identity (user id + email) is read here and passed along so we can
 * follow up; both are optional, so reporting works while signed out too.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePrivy } from '@privy-io/react-auth'
import type { BugReportDiagnostics, BugReportResult } from '../../../preload'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function BugReportModal({ onClose }: { onClose: () => void }) {
  const { user } = usePrivy()

  const [description, setDescription] = useState('')
  const [expected, setExpected] = useState('')
  const [email, setEmail] = useState(user?.email?.address ?? '')
  const [showDetails, setShowDetails] = useState(false)
  const [diag, setDiag] = useState<BugReportDiagnostics | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<BugReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pull diagnostics up front so the "what we'll include" panel is honest about
  // exactly what leaves the machine.
  useEffect(() => {
    window.bugReport?.getDiagnostics().then(setDiag).catch(() => {})
  }, [])

  // Esc closes (unless mid-send).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'sending') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, status])

  const sending = status === 'sending'
  const canSend = description.trim().length > 0 && !sending

  const submit = async () => {
    if (!canSend) return
    const api = window.bugReport
    if (!api) {
      setStatus('error')
      setError('Reporting is unavailable in this build.')
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const res = await api.submit({
        description,
        expected: expected.trim() || undefined,
        email: email.trim() || undefined,
        userId: user?.id,
      })
      if (res.ok) {
        setResult(res)
        setStatus('sent')
      } else {
        setError(res.error ?? 'Something went wrong filing the report.')
        setStatus('error')
      }
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }

  return createPortal(
    <div
      onClick={() => status !== 'sending' && onClose()}
      style={{
        // Above the FAB (10000) and the z-9999 splash, so reports work even
        // from the loading screen.
        position: 'fixed', inset: 0, zIndex: 10050,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--bg1)', border: '1px solid var(--border)',
          padding: 'var(--sp-5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '0.03em', lineHeight: 1, color: 'var(--fg)', margin: 0 }}>
              Report a problem
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg3)', margin: '6px 0 0' }}>
              early access · thanks for helping
            </p>
          </div>
          <button onClick={onClose} disabled={sending}
            style={{ background: 'none', border: 'none', color: 'var(--fg4)', fontSize: 16, cursor: sending ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', padding: '0 4px' }}>
            ✕
          </button>
        </div>

        {status === 'sent' ? (
          <SentPanel result={result} onClose={onClose} />
        ) : (
          <>
            <Field label="What happened?">
              <textarea
                autoFocus
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what you were doing and what went wrong…"
                rows={4}
                style={textareaStyle}
              />
            </Field>

            <Field label="What did you expect? (optional)">
              <textarea
                value={expected}
                onChange={e => setExpected(e.target.value)}
                placeholder="What should have happened instead?"
                rows={2}
                style={textareaStyle}
              />
            </Field>

            <Field label="Email for follow-up (optional)">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </Field>

            {/* Transparency: show exactly what gets attached. */}
            <button
              onClick={() => setShowDetails(s => !s)}
              style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg4)' }}>
              {showDetails ? '▾' : '▸'} what we’ll include
            </button>
            {showDetails && (
              <div style={{ border: '1px solid var(--glass-edge)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)',
                fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.7, color: 'var(--fg3)' }}>
                <div>App v{diag?.appVersion ?? '…'} · {diag?.os ?? '…'}</div>
                <div>{diag ? `Electron ${diag.electron} · Chrome ${diag.chrome}` : '…'}</div>
                <div style={{ marginTop: 4, color: 'var(--fg4)' }}>
                  + recent app logs (to help us reproduce). Nothing is sent until you press Send.
                </div>
              </div>
            )}

            {error && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--err)', lineHeight: 1.6, margin: '0 0 var(--sp-3)' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-3)' }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={sending}>
                cancel
              </button>
              <button className="studio-submit" style={{ flex: 2, opacity: canSend ? 1 : 0.5 }} onClick={submit} disabled={!canSend}>
                {sending ? 'sending…' : 'send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function SentPanel({ result, onClose }: { result: BugReportResult | null; onClose: () => void }) {
  const browser = result?.via === 'browser'
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', lineHeight: 1.7, margin: '0 0 var(--sp-3)' }}>
        {browser
          ? 'We opened GitHub in your browser — review the prefilled report and press “Submit new issue” to finish.'
          : 'Report sent — thank you. This really helps us fix things during early access.'}
      </p>
      {result?.url && (
        <a href={result.url} target="_blank" rel="noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
          view your report →
        </a>
      )}
      <div style={{ marginTop: 'var(--sp-4)' }}>
        <button className="studio-submit" style={{ width: '100%' }} onClick={onClose}>
          done
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--sp-3)' }}>
      <label style={{ display: 'block', marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)',
  fontFamily: 'var(--font-body)', fontSize: 13, padding: '8px 10px', outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', lineHeight: 1.5,
}
