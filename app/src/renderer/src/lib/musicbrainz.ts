/**
 * lib/musicbrainz.ts
 *
 * Online metadata lookup for the local-library editor. Queries the free
 * MusicBrainz recording API and normalizes hits into the fields our schema
 * cares about. Reuses the same endpoint + descriptive User-Agent already used in
 * views/TrackWikiView.tsx.
 *
 * Kept deliberately small and provider-shaped: `searchRecordings` returns generic
 * candidates, so a Gracenote/other backend could be added later behind the same
 * shape without touching the editor.
 */

const MB_UA = 'SOND3R/1.0.0 (https://fangorn.network)'

export interface MetaCandidate {
  title: string
  artist: string
  album: string | null
  datePublished: string | null
  isrcCode: string | null
  durationMs: number | null
  /** Source id (MusicBrainz recording MBID) — for dedupe / "open in MB". */
  sourceId: string
}

interface MbArtistCredit { name?: string; joinphrase?: string }
interface MbRelease { title?: string; date?: string }
interface MbRecording {
  id: string
  title?: string
  length?: number
  'artist-credit'?: MbArtistCredit[]
  'first-release-date'?: string
  isrcs?: string[]
  releases?: MbRelease[]
}

function creditedArtist(rec: MbRecording): string {
  const credits = rec['artist-credit'] ?? []
  if (!credits.length) return ''
  return credits.map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`).join('').trim()
}

/**
 * Search MusicBrainz recordings by artist + title. Either may be blank; a Lucene
 * query is built from whatever is provided. Returns up to `limit` candidates,
 * or [] on any network/parse failure (the caller surfaces "no results").
 */
export async function searchRecordings(
  artist: string,
  title: string,
  limit = 6,
): Promise<MetaCandidate[]> {
  const terms: string[] = []
  if (title.trim()) terms.push(`recording:"${title.trim().replace(/"/g, '')}"`)
  if (artist.trim()) terms.push(`artist:"${artist.trim().replace(/"/g, '')}"`)
  if (!terms.length) return []

  const q = encodeURIComponent(terms.join(' AND '))
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=${limit}&inc=isrcs+releases`,
      { headers: { 'User-Agent': MB_UA, Accept: 'application/json' } },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { recordings?: MbRecording[] }
    return (data.recordings ?? []).map((rec) => {
      const release = rec.releases?.[0]
      return {
        title: rec.title ?? title,
        artist: creditedArtist(rec) || artist,
        album: release?.title ?? null,
        datePublished: rec['first-release-date'] || release?.date || null,
        isrcCode: rec.isrcs?.[0] ?? null,
        durationMs: typeof rec.length === 'number' ? rec.length : null,
        sourceId: rec.id,
      }
    })
  } catch {
    return []
  }
}
