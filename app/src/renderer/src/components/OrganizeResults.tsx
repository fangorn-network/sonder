/**
 * components/OrganizeResults.tsx
 *
 * The post-action results screen shared by BOTH bulk import and standalone
 * auto-organize. It's the same flow either way — show what the organize pass did
 * (via <OrganizeReportCard>), then offer to finish up by adding artwork for
 * anything still missing it and reviewing tracks that couldn't be labeled
 * automatically.
 *
 * Contextually aware via its props:
 *   • `summary` (import only) prints the copy/reference outcome above the report.
 *   • `artScopeTracks` decides which artists/albums the artwork step covers — the
 *     just-imported set for an import, the whole library for a plain organize.
 *   • `primaryLabel` / `onPrimary` drive the footer's primary action ("Go to
 *     Unlabeled" for import, "Done" for organize).
 *
 * Rendered into a modal shell (header above, this fills the body + footer), so it
 * returns the scroll body and the pinned footer as siblings.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  useLocalMusic,
  type ImportSummary, type LocalTrack, type OrganizeProgress, type OrganizeReport,
} from '../providers/LocalMusicProvider'
import { missingArtTargets } from '../lib/artTargets'
import { OrganizeReportCard } from './OrganizeReportCard'
import { ArtworkFixerGrid } from './ArtworkFixerGrid'
import { LocalMetadataEditor } from './LocalMetadataEditor'

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

const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** Sub-screens within the results view. */
type Step = 'summary' | 'artwork' | 'review'

export function OrganizeResults({
  report, organizing = false, organizeProgress, summary, artScopeTracks, primaryLabel, onPrimary,
}: {
  /** The finished pass, or null while it's still running (import shows progress). */
  report: OrganizeReport | null
  /** True while the organize pass is still running (import flow only). */
  organizing?: boolean
  organizeProgress?: OrganizeProgress | null
  /** Import copy/reference outcome — present only for the bulk-import flow. */
  summary?: ImportSummary | null
  /** Artists/albums to offer artwork for (import: just-imported; organize: library). */
  artScopeTracks: LocalTrack[]
  primaryLabel: string
  onPrimary: () => void
}) {
  const lm = useLocalMusic()
  const [step, setStep] = useState<Step>('summary')
  const [reviewEditing, setReviewEditing] = useState<LocalTrack | null>(null)
  const [haveArt, setHaveArt] = useState<{ artist: string[]; album: string[] } | null>(null)

  // Re-fetch the stored-key set whenever artwork changes (artRev) so saved targets
  // drop off the "Add artwork" list.
  useEffect(() => {
    lm.listArtKeys().then(setHaveArt).catch(() => setHaveArt({ artist: [], album: [] }))
  }, [lm.artRev, lm.listArtKeys]) // eslint-disable-line react-hooks/exhaustive-deps
  const artTargets = useMemo(
    () => (haveArt ? missingArtTargets(artScopeTracks, haveArt) : []),
    [artScopeTracks, haveArt],
  )

  // What needs review is exactly the organizer's unresolved set, filtered to those
  // still unlabeled (so labeling one here drops it from the list).
  const reviewTracks = useMemo(() => {
    if (!report) return []
    const byId = new Map(lm.tracks.map((t) => [t.id, t]))
    return report.needsReviewIds
      .map((id) => byId.get(id))
      .filter((t): t is LocalTrack => !!t && !t.labeled)
  }, [report, lm.tracks])

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 80 }}>
        {step === 'artwork' ? (
          <StepBody title="Add artwork" subtitle="Pick a file or search online for any artist or album that's missing art.">
            <ArtworkFixerGrid targets={artTargets} emptyText="Every artist and album already has artwork." />
          </StepBody>
        ) : step === 'review' ? (
          <StepBody title="Review tracks" subtitle="These couldn't be labeled automatically. Add details to move each into your Library.">
            <ReviewList tracks={reviewTracks} onEdit={setReviewEditing} />
          </StepBody>
        ) : (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {summary && <SummaryView summary={summary} />}

            {/* The organize report. Under an import it's a labeled sub-section; on its
                own (auto-organize) it's the main content, so it stands unframed. */}
            {summary ? (
              <div style={{ borderTop: `1px solid ${BORDER2}`, paddingTop: 16 }}>
                <Label>Auto-organize</Label>
                <div style={{ marginTop: 10 }}>
                  <ReportBody report={report} organizing={organizing} progress={organizeProgress} />
                </div>
              </div>
            ) : (
              <ReportBody report={report} organizing={organizing} progress={organizeProgress} />
            )}

            {/* Finish up: optional artwork + manual review of what couldn't resolve. */}
            {report && !organizing && (artTargets.length > 0 || reviewTracks.length > 0) && (
              <div style={{ borderTop: `1px solid ${BORDER2}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Label>Finish up</Label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {artTargets.length > 0 && (
                    <StepBtn label={`Add artwork (${artTargets.length})`} onClick={() => setStep('artwork')} />
                  )}
                  {reviewTracks.length > 0 && (
                    <StepBtn
                      label={`Review ${reviewTracks.length} track${reviewTracks.length === 1 ? '' : 's'}`}
                      onClick={() => setStep('review')}
                      accent
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ flex: 1 }} />
        {organizing ? (
          <button disabled style={primaryBtn(false)}>Organizing…</button>
        ) : (
          <>
            {step !== 'summary' && <SmallBtn label="← Back" onClick={() => setStep('summary')} />}
            <button onClick={onPrimary} style={primaryBtn(true)}>{primaryLabel}</button>
          </>
        )}
      </div>

      {/* Labeling a review track opens the standard editor on top; saving moves it
          into the Library, so it drops out of the review list. */}
      {reviewEditing && (
        <LocalMetadataEditor track={reviewEditing} onClose={() => setReviewEditing(null)} />
      )}
    </>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

/** The report card, or a progress/placeholder line while the pass is still running. */
function ReportBody({
  report, organizing, progress,
}: {
  report: OrganizeReport | null
  organizing: boolean
  progress?: OrganizeProgress | null
}) {
  if (report) return <OrganizeReportCard report={report} />
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>
      {organizing ? `Organizing ${progress?.processed ?? 0} / ${progress?.total ?? 0}…` : 'Preparing…'}
    </div>
  )
}

/** A sub-screen (artwork / review): a titled, scroll-friendly wrapper. */
function StepBody({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: DISP, fontSize: 18, letterSpacing: '0.04em' }}>{title.toUpperCase()}</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  )
}

/** The unresolved (still-Unlabeled) tracks, each with a way to open the editor. */
function ReviewList({ tracks, onEdit }: { tracks: LocalTrack[]; onEdit: (t: LocalTrack) => void }) {
  if (tracks.length === 0) {
    return <div style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>Everything is labeled. 🎉</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tracks.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: BG2, border: `1px solid ${BORDER2}` }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontFamily: SANS, fontSize: 12.5, color: FG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.artist ? `${t.artist} — ${t.title}` : t.title || baseName(t.path)}
            </span>
            <span title={t.path} style={{ display: 'block', fontFamily: MONO, fontSize: 9.5, color: FG4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.path}
            </span>
          </span>
          <SmallBtn label="Label" onClick={() => onEdit(t)} />
        </div>
      ))}
    </div>
  )
}

/** A "finish up" entry button. */
function StepBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: accent ? ACCENT_DIM : BG2, border: `1px solid ${accent ? ACCENT_BORDER : BORDER2}`,
        color: accent ? ACCENT : FG2, fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer',
      }}
    >{label}</button>
  )
}

/** The import copy/reference outcome — shown only for the bulk-import flow. */
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

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? ACCENT : ACCENT_DIM, border: `1px solid ${enabled ? ACCENT : BORDER}`,
    color: enabled ? '#fff' : FG4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
    textTransform: 'uppercase', padding: '8px 18px', cursor: enabled ? 'pointer' : 'default',
  }
}
