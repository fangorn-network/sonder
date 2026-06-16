/**
 * components/LocalImportDialog.tsx
 *
 * Bulk-import music from another location (e.g. an external drive). The user
 * picks a source folder and chooses, per import, whether to COPY the files into
 * their library (so they survive the source being disconnected) or REFERENCE them
 * in place (no copy). Either way the imported tracks land in the Unlabeled tab,
 * where the existing bulk labeler takes over.
 *
 * Copy progress streams from the main process; referenced folders are listed here
 * with a remove control so the in-place option stays manageable.
 */

import { useState } from 'react'
import { useLocalMusic, type ImportMode, type ImportSummary } from '../providers/LocalMusicProvider'

const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const FG = 'var(--fg)'
const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const ACCENT_BORDER = 'var(--accent-border)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP = 'var(--font-display,"Bebas Neue",sans-serif)'

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export function LocalImportDialog({
  onClose, onImported,
}: {
  onClose: () => void
  /** Called once an import finishes (parent switches to the Unlabeled tab). */
  onImported: (summary: ImportSummary) => void
}) {
  const lm = useLocalMusic()

  const [source, setSource] = useState<{ path: string; audioCount: number } | null>(null)
  const [mode, setMode] = useState<ImportMode>('copy')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async () => {
    setError(null)
    const picked = await lm.pickImportSource()
    if (picked) setSource(picked)
  }

  const empty = !!source && source.audioCount === 0
  const canImport = !!source && !empty && !lm.importing

  const run = async () => {
    if (!source || !canImport) return
    setError(null)
    try {
      setSummary(await lm.importMusic(source.path, mode))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const pct = lm.importProgress && lm.importProgress.total > 0
    ? Math.round((lm.importProgress.processed / lm.importProgress.total) * 100)
    : null

  return (
    <div
      onClick={lm.importing ? undefined : onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: BG1, border: `1px solid ${BORDER}`, fontFamily: SANS, color: FG,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: '0.05em' }}>IMPORT MUSIC</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 3 }}>
              Bring in a folder or an external drive
            </div>
          </div>
          <button onClick={onClose} disabled={lm.importing} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: lm.importing ? 'default' : 'pointer', fontFamily: MONO, opacity: lm.importing ? 0.4 : 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 80 }}>
          {summary ? (
            <SummaryView summary={summary} />
          ) : (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Source */}
              <div>
                <Label>Source folder</Label>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SmallBtn label={source ? 'Change…' : 'Choose folder…'} onClick={choose} disabled={lm.importing} />
                  {source && (
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span title={source.path} style={{ display: 'block', fontFamily: MONO, fontSize: 11, color: FG2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {source.path}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: empty ? ACCENT : FG4 }}>
                        {source.audioCount} audio file{source.audioCount === 1 ? '' : 's'}{empty ? ' — nothing to import' : ''}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Mode */}
              <div>
                <Label>How to import</Label>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ModeOption
                    active={mode === 'copy'} onClick={() => setMode('copy')} disabled={lm.importing}
                    title="Copy into my library"
                    hint="Files are copied into your music folder. They stay available after the source is disconnected."
                  />
                  <ModeOption
                    active={mode === 'reference'} onClick={() => setMode('reference')} disabled={lm.importing}
                    title="Reference in place"
                    hint="Scan the files where they are — nothing is copied. They disappear when the source (e.g. an external drive) is disconnected."
                  />
                </div>
              </div>

              {/* Progress */}
              {lm.importing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, color: FG3 }}>
                    <span>{mode === 'copy' ? 'Copying…' : 'Adding folder…'}</span>
                    {pct != null && <span>{lm.importProgress?.processed} / {lm.importProgress?.total}</span>}
                  </div>
                  <div style={{ marginTop: 6, height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: pct != null ? `${pct}%` : '100%', background: ACCENT, transition: 'width 0.12s linear' }} />
                  </div>
                  {lm.importProgress?.file && (
                    <div title={lm.importProgress.file} style={{ marginTop: 5, fontFamily: MONO, fontSize: 9.5, color: FG4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lm.importProgress.file}
                    </div>
                  )}
                </div>
              )}

              {/* Referenced folders */}
              {lm.extraRoots.length > 0 && (
                <div>
                  <Label>Referenced folders</Label>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {lm.extraRoots.map((root) => (
                      <div key={root} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: BG2, border: `1px solid ${BORDER2}` }}>
                        <span title={root} style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 10.5, color: FG2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{root}</span>
                        <button
                          onClick={() => void lm.removeRoot(root)}
                          disabled={lm.importing}
                          title="Stop referencing this folder"
                          style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 9.5, padding: '2px 7px', cursor: lm.importing ? 'default' : 'pointer' }}
                        >Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ flex: 1, color: error ? ACCENT : FG4, fontFamily: MONO, fontSize: 11 }}>{error ?? ''}</span>
          {summary ? (
            <button
              onClick={() => { onImported(summary); onClose() }}
              style={primaryBtn(true)}
            >Go to Unlabeled</button>
          ) : (
            <>
              <SmallBtn label="Cancel" onClick={onClose} disabled={lm.importing} />
              <button onClick={run} disabled={!canImport} style={primaryBtn(canImport)}>
                {lm.importing ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

function SummaryView({ summary }: { summary: ImportSummary }) {
  const lines: string[] = []
  if (summary.mode === 'copy') {
    if (summary.total === 0) {
      lines.push('No audio files found there.')
    } else {
      lines.push(`Copied ${summary.copied} file${summary.copied === 1 ? '' : 's'} into your library.`)
      if (summary.skipped) lines.push(`${summary.skipped} already present — skipped.`)
      if (summary.failed) lines.push(`${summary.failed} could not be copied.`)
    }
  } else {
    lines.push(summary.referenced
      ? `Now referencing “${baseName(summary.source)}”.`
      : 'That folder is already part of your library.')
  }
  return (
    <div style={{ padding: '26px 20px', textAlign: 'center' }}>
      <div style={{ fontFamily: DISP, fontSize: 30, color: ACCENT, lineHeight: 1 }}>✓</div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: i === 0 ? SANS : MONO, fontSize: i === 0 ? 14 : 11, color: i === 0 ? FG : FG3 }}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 10.5, color: FG4 }}>
        Label them from the Unlabeled tab.
      </div>
    </div>
  )
}

function ModeOption({
  active, onClick, disabled, title, hint,
}: {
  active: boolean; onClick: () => void; disabled?: boolean; title: string; hint: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        background: active ? ACCENT_DIM : BG2, border: `1px solid ${active ? ACCENT_BORDER : BORDER2}`,
        padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        flexShrink: 0, marginTop: 2, width: 14, height: 14, borderRadius: '50%',
        border: `1px solid ${active ? ACCENT : FG4}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: SANS, fontSize: 13, color: active ? ACCENT : FG }}>{title}</span>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: FG3, marginTop: 3, lineHeight: 1.5 }}>{hint}</span>
      </span>
    </button>
  )
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? ACCENT : ACCENT_DIM, border: `1px solid ${enabled ? ACCENT : BORDER}`,
    color: enabled ? '#fff' : FG4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
    textTransform: 'uppercase', padding: '8px 18px', cursor: enabled ? 'pointer' : 'default',
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{children}</div>
}

function SmallBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: `1px solid ${BORDER}`, color: FG2, fontFamily: MONO,
        fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '7px 12px',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}
