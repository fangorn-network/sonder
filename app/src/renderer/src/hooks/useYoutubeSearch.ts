import { useCallback, useRef, useState } from 'react'
import type { Track } from '../types'

const YT_API_KEY = (import.meta as any).env.VITE_YOUTUBE_API_KEY as string

function parseISO8601Duration(d: string): number {
    const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!m) return 0
    return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000
}

function cleanYtTitle(title: string): string {
    return title
        .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|hd|hq|mv|4k|visualizer)[\)\]]/gi, '')
        .replace(/\s*-\s*(official\s*(video|audio|music\s*video)|lyrics?|hd|hq)$/gi, '')
        .replace(/\s*\|\s*.+$/, '') // strip "| Artist Name" suffixes
        .trim()
}

function parseArtistFromChannel(channelTitle: string): string {
    // "Bring Me The Horizon - Topic" → "Bring Me The Horizon"
    return channelTitle.replace(/\s*-\s*Topic$/i, '').trim()
}

async function ytFetch(url: string): Promise<any> {
    const { body } = await (window as any).electron.ipcRenderer.invoke('fetch:proxy', { url })
    return JSON.parse(body)
}

export function useYouTubeSearch() {
    const [ytTracks, setYtTracks] = useState<Track[]>([])
    const [ytLoading, setYtLoading] = useState(false)
    const abortRef = useRef<boolean>(false)

    const search = useCallback(async (query: string) => {
        if (!query.trim() || !YT_API_KEY) return
        abortRef.current = false
        setYtLoading(true)
        setYtTracks([])

        try {
            // Step 1: search.list — 100 quota units
            const searchParams = new URLSearchParams({
                part: 'snippet',
                q: `${query} official audio`,
                type: 'video',
                videoCategoryId: '10', // Music
                maxResults: '10',
                key: YT_API_KEY,
            })
            const searchData = await ytFetch(
                `https://www.googleapis.com/youtube/v3/search?${searchParams}`
            )

            if (abortRef.current) return
            const items: any[] = searchData.items ?? []
            if (items.length === 0) { setYtLoading(false); return }

            const ids = items.map(i => i.id.videoId).join(',')

            // Step 2: videos.list for duration — 1 quota unit
            const detailParams = new URLSearchParams({
                part: 'contentDetails,snippet',
                id: ids,
                key: YT_API_KEY,
            })
            const detailData = await ytFetch(
                `https://www.googleapis.com/youtube/v3/videos?${detailParams}`
            )

            if (abortRef.current) return

            const tracks: Track[] = (detailData.items ?? []).map((item: any): Track => ({
                id: `yt:${item.id}`,
                trackId: `yt:${item.id}`,     // ← add
                owner: "",                   // ← add (not published yet)
                title: cleanYtTitle(item.snippet.title),
                artist: parseArtistFromChannel(item.snippet.channelTitle),
                year: item.snippet.publishedAt
                    ? new Date(item.snippet.publishedAt).getFullYear()
                    : null,
                durationMs: parseISO8601Duration(item.contentDetails.duration),
                spotifyTrackId: null,
                manifestCid: "",
                youtubeVideoId: item.id,
                thumbnailUrl: item.snippet.thumbnails?.high?.url
                    ?? item.snippet.thumbnails?.medium?.url
                    ?? item.snippet.thumbnails?.default?.url
                    ?? undefined,
            }))

            setYtTracks(tracks)
        } catch (err) {
            console.error('[useYouTubeSearch] failed:', err)
        } finally {
            if (!abortRef.current) setYtLoading(false)
        }
    }, [])

    const clear = useCallback(() => {
        abortRef.current = true
        setYtTracks([])
        setYtLoading(false)
    }, [])

    return { ytTracks, ytLoading, search, clear }
}