/**
 * main/local/artSearch.ts
 *
 * Third-party artwork lookup for the local-library editors. Runs in the main
 * process so it isn't subject to the renderer's CSP (which blocks remote images
 * and cross-origin fetches): main fetches the provider JSON, downloads small
 * thumbnails, and hands the renderer inline `data:` URLs it can render directly.
 *
 * Backed by Deezer's public, key-free API, which covers BOTH album covers and
 * artist photos. Kept provider-shaped (returns generic ArtCandidate[]) so another
 * source — Cover Art Archive, iTunes, fanart.tv — could be slotted in later.
 *
 * Two entry points: searchArt() backs the manual picker and returns up to
 * MAX_RESULTS candidates, each with a downloaded thumbnail. bestTryArt() backs the
 * one-click "Best try" — it resolves many targets in a single call, downloading
 * only the first match's thumbnail per target (since that's all Best try shows),
 * so a big import is one IPC round-trip plus N light lookups rather than one full
 * eight-thumbnail search per item.
 */

import { imageUrlToDataUrl } from './art'
import { searchAlbums, searchArtists } from './deezer'
import type { ArtBestTryProgress, ArtCandidate, ArtQuery, ArtRequest, ArtScope } from './types'

const SEARCH_LIMIT = 12 // raw hits to consider before de-duping
const MAX_RESULTS = 8 // candidates returned to the renderer
/** How many Deezer lookups a "Best try" batch runs at once — enough to feel quick
 *  on a big import without hammering the keyless API. */
const BEST_TRY_CONCURRENCY = 4

/** A raw provider hit before any thumbnail is downloaded — the JSON lookup
 *  without the (expensive) image fetches. Shared by the full search and Best try. */
type RawHit = { fullUrl?: string; thumbUrl?: string; label: string }

/** Run the provider JSON search for one query and map it to raw hits, picking a
 *  sensible thumb + full URL for each. No images are downloaded here. */
async function hitsFor(scope: ArtScope, q: ArtQuery): Promise<RawHit[]> {
  const artist = q.artist.trim()
  if (!artist) return []
  if (scope === 'album') {
    const album = (q.album ?? '').trim()
    if (!album) return []
    const albums = await searchAlbums(artist, album, SEARCH_LIMIT)
    return albums.map((a) => ({
      fullUrl: a.cover_xl || a.cover_big,
      thumbUrl: a.cover_medium || a.cover_big,
      label: [a.artist?.name, a.title].filter(Boolean).join(' — ') || a.title,
    }))
  }
  const artists = await searchArtists(artist, SEARCH_LIMIT)
  return artists.map((a) => ({
    fullUrl: a.picture_xl || a.picture_big,
    thumbUrl: a.picture_medium || a.picture_big,
    label: a.name,
  }))
}

const usable = (r: RawHit): boolean => !!(r.fullUrl && r.thumbUrl)

/** Build an ArtCandidate from a usable hit, downloading its thumbnail as a data
 *  URL. Returns null if the thumbnail fails to download. Caller must pre-check
 *  `usable(r)`. */
async function toCandidate(r: RawHit): Promise<ArtCandidate | null> {
  try {
    return {
      source: 'Deezer',
      label: r.label,
      thumbDataUrl: await imageUrlToDataUrl(r.thumbUrl!),
      fullUrl: r.fullUrl!,
    }
  } catch {
    return null
  }
}

/** Search third-party artwork for an album cover or artist photo. Returns up to
 *  MAX_RESULTS candidates (de-duped by full URL, each with a downloaded thumbnail
 *  fetched concurrently), or [] on any failure — the caller surfaces "no results". */
export async function searchArt(scope: ArtScope, q: ArtQuery): Promise<ArtCandidate[]> {
  const seen = new Set<string>()
  const picks = (await hitsFor(scope, q))
    .filter((r) => usable(r) && !seen.has(r.fullUrl!) && seen.add(r.fullUrl!))
    .slice(0, MAX_RESULTS)
  const settled = await Promise.all(picks.map(toCandidate))
  return settled.filter((c): c is ArtCandidate => c !== null)
}

/** The single best candidate for one query, downloading ONLY its thumbnail (not
 *  the up-to-MAX_RESULTS the full search fetches). Null when there's no usable hit
 *  or its thumbnail fails to download. */
async function searchFirst(scope: ArtScope, q: ArtQuery): Promise<ArtCandidate | null> {
  const hit = (await hitsFor(scope, q)).find(usable)
  return hit ? toCandidate(hit) : null
}

/**
 * "Best try" over many targets in a single call. Returns the first match for each
 * request (or null) in the same order. Lookups run a few at a time so the keyless
 * API isn't hammered; `onProgress` ticks once per request resolved. Replaces the
 * renderer firing one IPC call + one full (eight-thumbnail) search per target.
 */
export async function bestTryArt(
  reqs: ArtRequest[],
  onProgress?: (p: ArtBestTryProgress) => void,
): Promise<(ArtCandidate | null)[]> {
  const results: (ArtCandidate | null)[] = new Array(reqs.length).fill(null)
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    while (next < reqs.length) {
      const i = next++
      results[i] = await searchFirst(reqs[i].scope, reqs[i].query)
      onProgress?.({ done: ++done, total: reqs.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(BEST_TRY_CONCURRENCY, reqs.length) }, worker))
  return results
}
