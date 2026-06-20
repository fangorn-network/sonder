/**
 * components/ArtworkFixerGrid.tsx
 *
 * A grid of artwork pickers for a list of artists / albums that need art. Reuses
 * <StagedArtSlot> (local file OR online search) for each target — picks are
 * staged, then committed together under the final artist/album keys when the user
 * hits "Save". Shared by the post-import "Add artwork" step and the Library's
 * "Artwork" tab; both just hand it the set of things missing art.
 *
 * "Best try" runs the same Deezer search for every still-empty target at once and
 * stages the first result it finds — a one-click way to fill out a big import,
 * which the user can still tweak per slot before saving.
 */

import { useMemo, useState } from 'react'
import { useLocalMusic, type ArtCandidate } from '../providers/LocalMusicProvider'
import { artistArtKey, albumArtKeyOf } from '../lib/artKeys'
import { type ArtTarget } from '../lib/artTargets'
import { StagedArtSlot, type StagedArt } from './StagedArtSlot'

const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const BORDER = 'var(--border)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'

const targetId = (t: ArtTarget): string => `${t.scope}::${t.artist}::${t.album ?? ''}`
const artKeyFor = (t: ArtTarget): string =>
  t.scope === 'artist' ? artistArtKey(t.artist) : albumArtKeyOf(t.artist, t.album ?? '')

export function ArtworkFixerGrid({
  targets, onSaved, emptyText = 'Everything here already has artwork.',
}: {
  targets: ArtTarget[]
  /** Called after staged picks are committed, with how many were saved. */
  onSaved?: (count: number) => void
  emptyText?: string
}) {
  const lm = useLocalMusic()
  const [staged, setStaged] = useState<Record<string, StagedArt | null>>({})
  const [saving, setSaving] = useState(false)
  // Non-null while "Best try" is running its batch of Deezer searches.
  const [trying, setTrying] = useState<{ done: number; total: number } | null>(null)

  const pending = useMemo(() => Object.values(staged).filter(Boolean).length, [staged])

  const setOne = (id: string, art: StagedArt | null) => setStaged((p) => ({ ...p, [id]: art }))

  const onSearch = (t: ArtTarget): (() => Promise<ArtCandidate[]>) =>
    t.scope === 'artist'
      ? () => lm.searchArt('artist', { artist: t.artist })
      : () => lm.searchArt('album', { artist: t.artist, album: t.album ?? '' })

  // Search Deezer for every target that isn't already chosen and stage the first
  // result. One batched IPC call does all the lookups in main (which downloads
  // just the first match's thumbnail per target and limits concurrency); progress
  // streams back as a running count. Targets with no hits are left for a manual
  // pick, and manual picks already made are untouched.
  const bestTry = async () => {
    const todo = targets.filter((t) => !staged[targetId(t)])
    if (todo.length === 0) return
    setTrying({ done: 0, total: todo.length })
    const off = lm.onBestTryProgress(setTrying)
    try {
      const found = await lm.bestTryArt(
        todo.map((t) => ({
          scope: t.scope,
          query: t.scope === 'artist' ? { artist: t.artist } : { artist: t.artist, album: t.album ?? '' },
        })),
      )
      setStaged((prev) => {
        const out = { ...prev }
        found.forEach((c, i) => {
          if (c) out[targetId(todo[i])] = { source: 'remote', url: c.fullUrl, dataUrl: c.thumbDataUrl }
        })
        return out
      })
    } finally {
      off()
      setTrying(null)
    }
  }

  const save = async () => {
    // Flatten every staged pick into one batch the main process commits together
    // (downloads run concurrently there, then persist in a single transaction).
    const items = targets.flatMap((t) => {
      const s = staged[targetId(t)]
      if (!s) return []
      const key = artKeyFor(t)
      return [{ scope: t.scope, key, source: s.source, src: s.source === 'local' ? s.path : s.url }]
    })
    if (items.length === 0) return
    setSaving(true)
    try {
      const { saved } = await lm.setArtMany(items)
      setStaged({})
      onSaved?.(saved)
    } catch {
      /* whole-batch failure (rare) — leave staged picks so the user can retry */
    } finally {
      setSaving(false)
    }
  }

  if (targets.length === 0) {
    return <div style={{ fontFamily: MONO, fontSize: 11, color: FG3, padding: '8px 0' }}>{emptyText}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 16, alignItems: 'start' }}>
        {targets.map((t) => {
          const id = targetId(t)
          return (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <StagedArtSlot
                scope={t.scope}
                shape={t.scope === 'artist' ? 'circle' : 'square'}
                label={t.scope === 'artist' ? t.artist : (t.album ?? '')}
                size={72}
                artKey={artKeyFor(t)}
                staged={staged[id] ?? null}
                onPick={(art) => setOne(id, art)}
                onClear={() => setOne(id, null)}
                onSearch={onSearch(t)}
              />
              {t.scope === 'album' && (
                <span title={t.artist} style={{ maxWidth: 104, fontFamily: MONO, fontSize: 9, color: FG4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.artist}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: FG4 }}>
          {trying
            ? `Searching Deezer… ${trying.done}/${trying.total}`
            : pending > 0 ? `${pending} ready to save` : 'Choose a file, search online, or hit Best try for any that are missing.'}
        </span>
        <button
          onClick={bestTry}
          disabled={!!trying || saving}
          title="Search Deezer for every item still missing art and stage the first match"
          style={{
            background: 'none', border: `1px solid ${BORDER}`, color: FG3, fontFamily: MONO,
            fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '8px 14px',
            cursor: trying || saving ? 'default' : 'pointer', opacity: trying || saving ? 0.6 : 1,
          }}
        >{trying ? 'Trying…' : '⚡ Best try'}</button>
        <button
          onClick={save}
          disabled={pending === 0 || saving || !!trying}
          style={{
            background: pending > 0 ? ACCENT : ACCENT_DIM, border: `1px solid ${pending > 0 ? ACCENT : BORDER}`,
            color: pending > 0 ? '#fff' : FG4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '8px 18px', cursor: pending > 0 && !saving && !trying ? 'pointer' : 'default',
          }}
        >{saving ? 'Saving…' : `Save artwork${pending > 0 ? ` (${pending})` : ''}`}</button>
      </div>
    </div>
  )
}
