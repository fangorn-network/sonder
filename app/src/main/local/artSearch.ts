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
 */

import { net } from 'electron'
import { imageUrlToDataUrl } from './art'
import type { ArtCandidate, ArtQuery, ArtScope } from './types'

const SEARCH_LIMIT = 12 // raw hits to consider before de-duping
const MAX_RESULTS = 8 // candidates returned to the renderer

interface DeezerArtist { id: number; name: string; picture_medium?: string; picture_xl?: string; picture_big?: string }
interface DeezerAlbum {
  id: number; title: string
  cover_medium?: string; cover_big?: string; cover_xl?: string
  artist?: { name?: string }
}

async function deezerJson<T>(url: string): Promise<T | null> {
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Advanced Deezer query fragment, quoting the value and stripping quotes. */
const term = (field: string, value: string) => `${field}:"${value.replace(/"/g, '')}"`

/**
 * Turn raw hits into ArtCandidates: pick a sensible thumb + full URL, drop any
 * without imagery, de-dupe by full URL, and inline each thumbnail as a data URL.
 * Thumbnails are fetched concurrently; any that fail to download are skipped.
 */
async function toCandidates(
  raw: { fullUrl?: string; thumbUrl?: string; label: string }[],
): Promise<ArtCandidate[]> {
  const seen = new Set<string>()
  const picks = raw
    .filter((r) => r.fullUrl && r.thumbUrl && !seen.has(r.fullUrl) && seen.add(r.fullUrl))
    .slice(0, MAX_RESULTS)

  const settled = await Promise.all(
    picks.map(async (r): Promise<ArtCandidate | null> => {
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
    }),
  )
  return settled.filter((c): c is ArtCandidate => c !== null)
}

async function searchAlbums(q: ArtQuery): Promise<ArtCandidate[]> {
  const artist = q.artist.trim()
  const album = (q.album ?? '').trim()
  if (!artist || !album) return []
  const query = encodeURIComponent([term('artist', artist), term('album', album)].join(' '))
  const data = await deezerJson<{ data?: DeezerAlbum[] }>(
    `https://api.deezer.com/search/album?q=${query}&limit=${SEARCH_LIMIT}`,
  )
  return toCandidates(
    (data?.data ?? []).map((a) => ({
      fullUrl: a.cover_xl || a.cover_big,
      thumbUrl: a.cover_medium || a.cover_big,
      label: [a.artist?.name, a.title].filter(Boolean).join(' — ') || a.title,
    })),
  )
}

async function searchArtists(q: ArtQuery): Promise<ArtCandidate[]> {
  const artist = q.artist.trim()
  if (!artist) return []
  const data = await deezerJson<{ data?: DeezerArtist[] }>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=${SEARCH_LIMIT}`,
  )
  return toCandidates(
    (data?.data ?? []).map((a) => ({
      fullUrl: a.picture_xl || a.picture_big,
      thumbUrl: a.picture_medium || a.picture_big,
      label: a.name,
    })),
  )
}

/** Search third-party artwork for an album cover or artist photo. Returns [] on
 *  any failure — the caller surfaces "no results". */
export function searchArt(scope: ArtScope, q: ArtQuery): Promise<ArtCandidate[]> {
  return scope === 'album' ? searchAlbums(q) : searchArtists(q)
}
