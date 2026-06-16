/**
 * main/local/discovery.ts
 *
 * Read-only check of which locally-labeled tracks are present in the SOND3R
 * catalog (the Qdrant `fangorn` collection), so the UI can flag them as
 * "semantically discoverable". Nothing is written to Qdrant here.
 *
 * Matching is by the `fields.trackId` payload, NOT by point id: catalog points
 * are stored under random UUIDs, so they can't be addressed deterministically.
 * The catalog's trackId is `sha256(`${artist}:${title}`)[:24]` computed over the
 * *lowercased* artist + title — note this differs from the local `computeTrackId`
 * (./catalog), which preserves the original casing. We recompute the catalog form
 * here and ask Qdrant which of those trackIds exist via a batched MatchAny scroll.
 * (Verified against live catalog points, e.g. "Hey" by Pixies.)
 */

import { createHash } from 'crypto'
import { net } from 'electron'
import * as catalog from './catalog'

// Qdrant sidecar — localhost only, same host/port main/index.ts boots it on.
const QDRANT_URL = 'http://127.0.0.1:6333'
const COLLECTION = 'fangorn'
// MatchAny does a full collection scan per scroll (fields.trackId isn't indexed),
// so prefer bigger chunks — fewer scans — over many small ones. Each scan is
// ~0.4s over 860k points regardless of how many ids we test against.
const CHUNK = 1000

/**
 * The catalog's canonical track id: first 24 hex of `sha256("{artist}:{title}")`
 * over the trimmed + lowercased artist and title. This is the publish/ingest
 * scheme, which lowercases — unlike the local computeTrackId in ./catalog.
 */
function catalogTrackId(artist: string, title: string): string {
  const key = `${artist.trim().toLowerCase()}:${title.trim().toLowerCase()}`
  return createHash('sha256').update(key).digest('hex').slice(0, 24)
}

/**
 * Ask Qdrant which of these catalog trackIds exist, batched. Filters on the
 * `fields.trackId` payload with MatchAny and pages through each chunk's results.
 * Resolves to the subset present; on any error (Qdrant down, collection missing)
 * returns what it has so far rather than throwing — callers treat "can't tell"
 * as "nothing to flag".
 */
async function existingTrackIds(trackIds: string[]): Promise<Set<string>> {
  const present = new Set<string>()
  for (let i = 0; i < trackIds.length; i += CHUNK) {
    const chunk = trackIds.slice(i, i + CHUNK)
    let offset: unknown = undefined
    do {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await net.fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must: [{ key: 'fields.trackId', match: { any: chunk } }] },
            limit: chunk.length,
            offset: offset ?? undefined,
            with_payload: { include: ['fields.trackId'] },
            with_vector: false,
          }),
          signal: ctrl.signal,
        })
        if (!res.ok) return present
        const body = await res.json().catch(() => null)
        const result = body?.result
        const points = result && Array.isArray(result.points) ? result.points : []
        for (const pt of points) {
          const tid = pt?.payload?.fields?.trackId
          if (typeof tid === 'string') present.add(tid)
        }
        offset = result?.next_page_offset ?? null
      } catch {
        return present // Qdrant down / not ready — nothing discoverable for now.
      } finally {
        clearTimeout(timer)
      }
    } while (offset)
  }
  return present
}

/**
 * Local ids of labeled tracks that have a vector in the catalog. Derives each
 * labeled track's catalog trackId from its artist + title, batch-checks which
 * exist, and maps the hits back to local ids. Several local files can share one
 * trackId (the same song twice), so a trackId maps to a list of local ids.
 */
export async function listDiscoverableLocalIds(): Promise<string[]> {
  const metas = catalog.listMeta()
  if (metas.size === 0) return []

  const tidToLocals = new Map<string, string[]>()
  for (const [localId, meta] of metas) {
    if (!meta.title || !meta.byArtist) continue
    const tid = catalogTrackId(meta.byArtist, meta.title)
    const arr = tidToLocals.get(tid)
    if (arr) arr.push(localId)
    else tidToLocals.set(tid, [localId])
  }
  if (tidToLocals.size === 0) return []

  const existing = await existingTrackIds([...tidToLocals.keys()])
  const out: string[] = []
  for (const tid of existing) {
    const locals = tidToLocals.get(tid)
    if (locals) out.push(...locals)
  }
  return out
}
