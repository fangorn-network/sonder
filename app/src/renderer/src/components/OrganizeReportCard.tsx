/**
 * components/OrganizeReportCard.tsx
 *
 * Summary of an auto-organize pass — what got labeled, what was merged, what was
 * skipped as a duplicate, and any near-duplicate artist names that need a human
 * eye. Rendered inside <OrganizeResults>, the shared results screen for both the
 * import dialog and the Unlabeled-tab "Auto-organize" modal.
 *
 * Mostly presentational, with one interactive bit: when an `onMerge` handler is
 * provided, each "possible duplicate artists" suggestion becomes resolvable — the
 * user picks the correct spelling and merges the rest into it.
 */

import { useState } from 'react'
import type { OrganizeReport } from '../providers/LocalMusicProvider'

const FG = 'var(--fg)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const ACCENT_BORDER = 'var(--accent-border)'
const BORDER2 = 'var(--border2)'
const SUCCESS = 'var(--success)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
// Big stat numbers use the display face if present, else mono.
const DISP_OR_MONO = 'var(--font-display,"Bebas Neue",var(--font-mono,monospace))'

export function OrganizeReportCard({
  report, onMerge,
}: {
  report: OrganizeReport
  /** Resolve a duplicate-artist suggestion; returns how many tracks were renamed.
   *  Omitted in read-only contexts — then the suggestions just display. */
  onMerge?: (canonical: string, variants: string[]) => Promise<number>
}) {
  const stats: { label: string; value: number; tone?: 'accent' }[] = [
    { label: 'Labeled', value: report.labeled },
    { label: 'Artists merged', value: report.artistsMerged },
    { label: 'Albums merged', value: report.albumsMerged },
    { label: 'Duplicates skipped', value: report.duplicates },
    { label: 'Need review', value: report.needsReview, tone: 'accent' as const },
  ].filter((s) => s.value > 0 || s.label === 'Labeled')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ border: `1px solid ${BORDER2}`, padding: '10px 12px' }}>
            <div style={{ fontFamily: DISP_OR_MONO, fontSize: 22, color: s.tone === 'accent' && s.value > 0 ? ACCENT : FG }}>{s.value}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: FG4, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {report.processed === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>Nothing left to organize.</div>
      )}

      {report.artistSuggestions.length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: FG4 }}>
            {onMerge ? 'Possible duplicate artists — pick the correct spelling' : 'Possible duplicate artists — review'}
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.artistSuggestions.slice(0, 8).map((s) => (
              <DuplicateArtistRow key={s.variants.join('|')} variants={s.variants} onMerge={onMerge} />
            ))}
          </div>
        </div>
      )}

      {report.needsReview > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, lineHeight: 1.5 }}>
          {report.needsReview} track{report.needsReview === 1 ? '' : 's'} couldn’t be resolved automatically — they’re still
          in Unlabeled for manual labeling.
        </div>
      )}

      {report.duplicates > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, lineHeight: 1.5 }}>
          {report.duplicates} duplicate{report.duplicates === 1 ? '' : 's'} (same artist + title) were left Unlabeled so you
          can delete the redundant files.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9.5, color: SUCCESS }}>
        <span>●</span><span>Labeled tracks moved into your Library.</span>
      </div>
    </div>
  )
}

/**
 * One near-duplicate artist suggestion. The variant spellings are shown as a
 * selectable group (the first is the default choice), with a text field to type a
 * different name in case both variants are wrong; hitting "Merge" rewrites every
 * track under the variant spellings to the chosen/typed one. Without `onMerge`
 * it's a read-only list of the variants.
 */
function DuplicateArtistRow({
  variants, onMerge,
}: {
  variants: string[]
  onMerge?: (canonical: string, variants: string[]) => Promise<number>
}) {
  const [chosen, setChosen] = useState(variants[0])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [merged, setMerged] = useState<string | null>(null)

  if (!onMerge) {
    return <div style={{ fontFamily: SANS, fontSize: 12.5, color: FG }}>{variants.join('  ·  ')}</div>
  }

  if (merged) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10.5, color: SUCCESS }}>
        <span>✓</span><span>Merged into “{merged}”.</span>
      </div>
    )
  }

  // A typed name wins over a picked chip; fall back to the picked variant.
  const canonical = custom.trim() || chosen

  const merge = async () => {
    if (!canonical) return
    setBusy(true)
    try {
      await onMerge(canonical, variants)
      setMerged(canonical)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {variants.map((v) => {
            const sel = !custom.trim() && v === chosen
            return (
              <button
                key={v}
                onClick={() => { setChosen(v); setCustom('') }}
                disabled={busy}
                title={sel ? 'Keep this spelling' : 'Use this spelling'}
                style={{
                  fontFamily: SANS, fontSize: 12, padding: '4px 10px',
                  background: sel ? ACCENT_DIM : 'transparent',
                  border: `1px solid ${sel ? ACCENT_BORDER : BORDER2}`,
                  color: sel ? ACCENT : FG, cursor: busy ? 'default' : 'pointer',
                }}
              >{v}</button>
            )
          })}
        </div>
        <button
          onClick={merge}
          disabled={busy || !canonical}
          style={{
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase',
            padding: '6px 12px', background: 'none', border: `1px solid ${ACCENT_BORDER}`,
            color: ACCENT, cursor: busy || !canonical ? 'default' : 'pointer', opacity: busy || !canonical ? 0.6 : 1, whiteSpace: 'nowrap',
          }}
        >{busy ? 'Merging…' : 'Merge'}</button>
      </div>
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        disabled={busy}
        placeholder="Or type the correct spelling…"
        style={{
          fontFamily: SANS, fontSize: 12, padding: '5px 8px', width: '100%', boxSizing: 'border-box',
          background: 'transparent', color: FG,
          border: `1px solid ${custom.trim() ? ACCENT_BORDER : BORDER2}`, outline: 'none',
        }}
      />
    </div>
  )
}
