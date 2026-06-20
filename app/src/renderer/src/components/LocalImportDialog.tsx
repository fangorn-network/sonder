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

import { useEffect, useMemo, useState } from 'react'
import { useLocalMusic, type ImportMode, type ImportSummary, type OrganizeReport } from '../providers/LocalMusicProvider'
import { OrganizeResults } from './OrganizeResults'

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

/** Is `p` the folder `root` or a file beneath it? Used to scope the just-imported
 *  tracks (which live under the copy destination, or the referenced source). */
function underRoot(p: string, root: string): boolean {
  if (!root) return false
  const r = root.replace(/[\\/]+$/, '')
  return p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}\\`)
}

/** Where this import's tracks landed: the copy destination, else the referenced
 *  source folder. */
const importRootOf = (s: ImportSummary): string => s.dest ?? s.source

/** Human, deliberately rough remaining-time label (e.g. "~3 min", "~1h 12m"). */
function formatDuration(ms: number): string {
  const secs = Math.max(1, Math.round(ms / 1000))
  if (secs < 60) return `~${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `~${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `~${hrs}h ${rem}m` : `~${hrs}h`
}

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
  const [orgReport, setOrgReport] = useState<OrganizeReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = lm.importing || lm.organizing

  // Library tracks from THIS import (under the copy dest / referenced source) —
  // the scope for the results screen's "Add artwork" / review steps.
  const importRoot = summary ? importRootOf(summary) : ''
  const importedLibrary = useMemo(
    () => (importRoot ? lm.libraryTracks.filter((t) => underRoot(t.path, importRoot)) : []),
    [lm.libraryTracks, importRoot],
  )

  const choose = async () => {
    setError(null)
    const picked = await lm.pickImportSource()
    if (picked) setSource(picked)
  }

  const empty = !!source && source.audioCount === 0
  const canImport = !!source && !empty && !busy

  const run = async () => {
    if (!source || !canImport) return
    setError(null)
    try {
      setSummary(await lm.importMusic(source.path, mode))
      // Auto-organize the freshly imported (Unlabeled) tracks.
      setOrgReport(await lm.autoOrganize())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  // Active progress: import (copy) first, then auto-organize.
  const prog = lm.importing ? lm.importProgress : lm.organizing ? lm.organizeProgress : null
  const phase = lm.importing ? (mode === 'copy' ? 'Copying…' : 'Adding folder…') : lm.organizing ? 'Auto-organizing…' : ''
  const pct = prog && prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : null

  // Rough ETA for the copy import. A clock ticks `now` every 500ms; `startedAt`
  // is anchored to it the moment copying begins (the blessed "adjust state during
  // render" pattern, so no impure Date.now() in render or handlers). We then
  // project the remaining files off the average files/sec rate — average (not
  // instantaneous) stays stable despite per-file size swings — waiting a beat
  // before showing a (rounded) estimate.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [wasImporting, setWasImporting] = useState(false)
  if (lm.importing !== wasImporting) {
    setWasImporting(lm.importing)
    setStartedAt(lm.importing ? now : null)
  }
  const eta = useMemo(() => {
    const p = lm.importProgress
    if (!lm.importing || startedAt == null || !p || p.total <= 0 || p.processed <= 0) return null
    const elapsed = now - startedAt
    const remaining = p.total - p.processed
    if (elapsed < 1500 || remaining <= 0) return null // too early / done
    return formatDuration((remaining / p.processed) * elapsed)
  }, [lm.importing, lm.importProgress, startedAt, now])

  return (
    <div
      onClick={busy ? undefined : onClose}
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
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: busy ? 'default' : 'pointer', fontFamily: MONO, opacity: busy ? 0.4 : 1 }}>✕</button>
        </div>

        {summary ? (
          // Once imported, the shared results screen takes over (summary + the
          // auto-organize report + finish-up artwork / review).
          <OrganizeResults
            report={orgReport}
            organizing={lm.organizing}
            organizeProgress={lm.organizeProgress}
            summary={summary}
            artScopeTracks={importedLibrary}
            primaryLabel="Go to Unlabeled"
            onPrimary={() => { onImported(summary); onClose() }}
          />
        ) : (
          <>
            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 80, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Source */}
              <div>
                <Label>Source folder</Label>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SmallBtn label={source ? 'Change…' : 'Choose folder…'} onClick={choose} disabled={busy} />
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
                    active={mode === 'copy'} onClick={() => setMode('copy')} disabled={busy}
                    title="Copy into my library"
                    hint="Files are copied into your music folder. They stay available after the source is disconnected."
                  />
                  <ModeOption
                    active={mode === 'reference'} onClick={() => setMode('reference')} disabled={busy}
                    title="Reference in place"
                    hint="Scan the files where they are — nothing is copied. They disappear when the source (e.g. an external drive) is disconnected."
                  />
                </div>
              </div>

              {/* Progress */}
              {busy && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, color: FG3 }}>
                    <span>{phase}{eta ? <span style={{ color: FG4 }}> · {eta} left</span> : null}</span>
                    {pct != null && <span>{prog?.processed} / {prog?.total}</span>}
                  </div>
                  <div style={{ marginTop: 6, height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: pct != null ? `${pct}%` : '100%', background: ACCENT, transition: 'width 0.12s linear' }} />
                  </div>
                  {lm.importing && lm.importProgress?.file && (
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
                          disabled={busy}
                          title="Stop referencing this folder"
                          style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 9.5, padding: '2px 7px', cursor: busy ? 'default' : 'pointer' }}
                        >Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ flex: 1, color: error ? ACCENT : FG4, fontFamily: MONO, fontSize: 11 }}>{error ?? ''}</span>
              {busy ? (
                <button disabled style={primaryBtn(false)}>{lm.importing ? 'Importing…' : 'Organizing…'}</button>
              ) : (
                <>
                  <SmallBtn label="Cancel" onClick={onClose} disabled={busy} />
                  <button onClick={run} disabled={!canImport} style={primaryBtn(canImport)}>Import</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

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
