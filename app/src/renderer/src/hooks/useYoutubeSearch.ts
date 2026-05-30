import { useCallback, useRef, useState } from 'react'
import type { Track } from '../types'

function cleanYtTitle(title: string): string {
    return title
        .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|hd|hq|mv|4k|visualizer)[\)\]]/gi, '')
        .replace(/\s*-\s*(official\s*(video|audio|music\s*video)|lyrics?|hd|hq)$/gi, '')
        .replace(/\s*\|\s*.+$/, '')
        .trim()
}

function parseArtistFromChannel(channelTitle: string): string {
    return channelTitle.replace(/\s*-\s*Topic$/i, '').trim()
}

export function useYouTubeSearch() {
    const [ytTracks, setYtTracks] = useState<Track[]>([])
    const [ytLoading, setYtLoading] = useState(false)
    const abortRef = useRef<boolean>(false)

    const search = useCallback(async (query: string) => {
        if (!query.trim()) return
        abortRef.current = false
        setYtLoading(true)
        setYtTracks([])

        try {
            const results: any[] = await (window as any).electron.ipcRenderer.invoke(
                'yt:search', query
            )
            if (abortRef.current) return

            const tracks: Track[] = results
                .filter(r => r.id && r.title)
                .map((r) => {
                    const title = (r.title ?? '').toLowerCase()
                    const channel = (r.channel ?? r.uploader ?? '').toLowerCase()
                    const q = query.toLowerCase()
                    let score = 0

                    if (title.includes('official audio')) score += 40
                    if (title.includes('official music video')) score += 35
                    if (title.includes('official video')) score += 30
                    if (channel.includes('- topic')) score += 25
                    if (channel.includes('official')) score += 20
                    if (title.includes('official')) score += 15
                    if (title.includes('audio')) score += 10
                    if (title.includes('lyrics')) score += 5
                    if (title.includes('live')) score -= 40
                    if (title.includes('concert')) score -= 40
                    if (title.includes('cover')) score -= 35
                    if (title.includes('reaction')) score -= 50
                    if (title.includes('karaoke')) score -= 60
                    if (title.includes('remix') && !q.includes('remix')) score -= 20
                    if (title.includes('acoustic') && !q.includes('acoustic')) score -= 15

                    return {
                        score,
                        id: `yt:${r.id}`,
                        trackId: `yt:${r.id}`,
                        owner: '',
                        manifestCid: '',
                        title: cleanYtTitle(r.title),
                        artist: parseArtistFromChannel(r.channel ?? r.uploader ?? ''),
                        year: r.upload_date
                            ? parseInt(r.upload_date.slice(0, 4)) || null
                            : null,
                        durationMs: r.duration ? Math.round(r.duration * 1000) : null,
                        youtubeVideoId: r.id,
                        thumbnailUrl: r.thumbnail ?? undefined,
                    }
                })
                .sort((a, b) => b.score - a.score)
                .map(({ score, ...track }): Track => track)

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