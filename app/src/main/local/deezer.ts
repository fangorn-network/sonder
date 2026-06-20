/**
 * main/local/deezer.ts
 *
 * The single place that talks to Deezer's public, key-free API. Lives in the main
 * process because the renderer's CSP blocks cross-origin fetches — anything in the
 * renderer that needs Deezer goes through an IPC handler backed by this module.
 *
 * Holds the base URL, the JSON shapes we read, the advanced-query helper, the
 * fetch+parse wrapper, and the typed search calls. Callers (artSearch, the
 * `deezer:track-cover` IPC handler) stay free of raw URLs and JSON field names.
 */

import { net } from 'electron'

/** Base URL for every Deezer endpoint. */
export const DEEZER_API = 'https://api.deezer.com'

// ─── JSON shapes (only the fields we read) ──────────────────────────────────────

export interface DeezerArtist {
  id: number
  name: string
  picture_medium?: string
  picture_xl?: string
  picture_big?: string
}

export interface DeezerAlbum {
  id: number
  title: string
  cover_medium?: string
  cover_big?: string
  cover_xl?: string
  artist?: { name?: string }
}

export interface DeezerTrack {
  id: number
  title: string
  album?: { cover_xl?: string; cover_big?: string; cover_medium?: string }
}

/** Every Deezer search endpoint returns `{ data: [...] }`. */
interface DeezerList<T> {
  data?: T[]
}

// ─── Low-level helpers ──────────────────────────────────────────────────────────

/** Advanced-query fragment: `field:"value"`, with embedded quotes stripped. */
export const term = (field: string, value: string): string =>
  `${field}:"${value.replace(/"/g, '')}"`

/** GET a Deezer URL and parse its JSON, or null on any network/parse failure. */
export async function deezerJson<T>(url: string): Promise<T | null> {
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ─── Typed searches ─────────────────────────────────────────────────────────────

/** Search albums by artist + album title. */
export function searchAlbums(
  artist: string,
  album: string,
  limit: number,
): Promise<DeezerAlbum[]> {
  const q = encodeURIComponent([term('artist', artist), term('album', album)].join(' '))
  return deezerJson<DeezerList<DeezerAlbum>>(`${DEEZER_API}/search/album?q=${q}&limit=${limit}`).then(
    (d) => d?.data ?? [],
  )
}

/** Search artists by name. */
export function searchArtists(artist: string, limit: number): Promise<DeezerArtist[]> {
  const q = encodeURIComponent(artist)
  return deezerJson<DeezerList<DeezerArtist>>(`${DEEZER_API}/search/artist?q=${q}&limit=${limit}`).then(
    (d) => d?.data ?? [],
  )
}

/** Full-resolution album cover for the first track matching artist + title, or
 *  null. Backs the BrowseView album-art fallback. */
export async function trackCover(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent([term('artist', artist), term('track', title)].join(' '))
  const data = await deezerJson<DeezerList<DeezerTrack>>(`${DEEZER_API}/search?q=${q}&limit=1`)
  return data?.data?.[0]?.album?.cover_xl ?? null
}
