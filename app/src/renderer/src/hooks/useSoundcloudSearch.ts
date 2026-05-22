import { useCallback, useRef, useState } from 'react'
import type { Track } from '../types'

function cleanScTitle(title: string): string {
  return title
    .replace(/\s*[\(\[](free\s*download|free|download|official|hq|hd)[\)\]]/gi, '')
    .replace(/\s*\|\s*.+$/, '')
    .trim()
}

function parseArtistFromUser(username: string): string {
  return username.replace(/_/g, ' ').trim()
}

// Extract a yt-dlp resolvable source from a SoundCloud flat-playlist entry.
// Preference: webpage_url (canonical permalink) > url if it looks like a
// permalink > scsearch fallback using title+artist.
function resolveScSource(r: any): string {
  const wp = r.webpage_url ?? ''
  if (wp.startsWith('https://soundcloud.com/')) return wp

  const url = r.url ?? ''
  if (url.startsWith('https://soundcloud.com/')) return url

  // API URLs (api.soundcloud.com/tracks/...) don't resolve via yt-dlp —
  // fall back to a search string which will do scsearch: internally
  const title  = cleanScTitle(r.title ?? '')
  const artist = parseArtistFromUser(r.uploader ?? r.channel ?? '')
  return artist ? `${title} ${artist}` : title
}

export function useSoundCloudSearch() {
  const [scTracks, setScTracks]   = useState<Track[]>([])
  const [scLoading, setScLoading] = useState(false)
  const abortRef = useRef(false)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return
    abortRef.current = false
    setScLoading(true)
    setScTracks([])

    try {
      const results: any[] = await (window as any).electron.ipcRenderer.invoke(
        'yt:search:sc',
        query,
      )
      if (abortRef.current) return

      const tracks: Track[] = results
        .filter(r => r.title)
        .map((r): Track => ({
          id:             `sc:${r.id}`,
          trackId:        `sc:${r.id}`,
          owner:          '',
          manifestCid:    '',
          title:          cleanScTitle(r.title),
          artist:         parseArtistFromUser(r.uploader ?? r.channel ?? ''),
          year:           r.upload_date
            ? parseInt(r.upload_date.slice(0, 4)) || null
            : null,
          durationMs:     r.duration ? Math.round(r.duration * 1000) : null,
          youtubeVideoId: resolveScSource(r),
          thumbnailUrl:   r.thumbnail ?? undefined,
        }))

      setScTracks(tracks)
    } catch (err) {
      console.error('[useSoundCloudSearch] failed:', err)
    } finally {
      if (!abortRef.current) setScLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    abortRef.current = true
    setScTracks([])
    setScLoading(false)
  }, [])

  return { scTracks, scLoading, search, clear }
}