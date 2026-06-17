/**
 * components/OrganizeReportCard.tsx
 *
 * Presentational summary of an auto-organize pass — what got labeled, what was
 * merged, what was skipped as a duplicate, and any near-duplicate artist names
 * that need a human eye. Rendered inside <OrganizeResults>, the shared results
 * screen for both the import dialog and the Unlabeled-tab "Auto-organize" modal.
 */

import type { OrganizeReport } from '../providers/LocalMusicProvider'

const FG = 'var(--fg)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const BORDER2 = 'var(--border2)'
const SUCCESS = 'var(--success)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
// Big stat numbers use the display face if present, else mono.
const DISP_OR_MONO = 'var(--font-display,"Bebas Neue",var(--font-mono,monospace))'

export function OrganizeReportCard({ report }: { report: OrganizeReport }) {
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
            Possible duplicate artists — review
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.artistSuggestions.slice(0, 8).map((s) => (
              <div key={s.canonical} style={{ fontFamily: SANS, fontSize: 12.5, color: FG }}>
                {s.variants.join('  ·  ')}
              </div>
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
