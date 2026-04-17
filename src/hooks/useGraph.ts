import { useState, useEffect, useCallback, useRef } from 'react'
import { execute } from '../../.graphclient'
import { GetTracksDocument, SearchTracksDocument } from '../../.graphclient'
import type { Track } from '../types'

const PAGE_SIZE = 10

function normalizeManifestState(state: any): Track[] {
    const { id: stateId, owner, schemaName, manifest } = state
    if (!manifest?.files) return []
    return manifest.files.map((file: any, i: number) => {
        const fields: Record<string, any> = {}
        for (const f of file.fileFields ?? []) {
            fields[f.name ?? ''] = f
        }
        const name = file.name ?? `track-${i}`
        return {
            id: `${stateId}-${name}-${i}`,
            title: fields['title']?.value ?? name,
            artist: fields['artist']?.value ?? owner.slice(0, 8) + '…',
            album: fields['album']?.value ?? schemaName,
            trackNumber: fields['trackNumber']?.value ?? null,
            duration: fields['duration']?.value ?? '—',
            genre: fields['genre']?.value ?? '',
            image: fields['image']?.value ?? null,
            owner,
            datasourceName: schemaName,
            name,
            price: (parseFloat(fields['price']?.value)).toString() ?? '0',
            currency: 'USDC',
            acc: fields['audio']?.acc ?? null,
        } satisfies Track
    })
}

function dedup(tracks: Track[]): Track[] {
    const seen = new Map<string, Track>()
    for (const track of tracks) {
        const key = `${track.owner}:${track.datasourceName}:${track.name}`
        if (!seen.has(key)) seen.set(key, track)
    }
    return Array.from(seen.values())
}

function normalizeResults(data: any): Track[] {
    return dedup((data.manifestStates ?? []).flatMap(normalizeManifestState))
}

function normalizeSearchResults(data: any, term: string): Track[] {
    const lower = term.toLowerCase()
    return dedup((data.manifestStates ?? []).flatMap(normalizeManifestState))
        .filter((track: Track) =>
            track.title.toLowerCase().includes(lower) ||
            track.artist.toLowerCase().includes(lower) ||
            (track.album ?? '').toLowerCase().includes(lower) ||
            (track.genre ?? '').toLowerCase().includes(lower)
        )
}

export interface UseGraphResult {
    tracks: Track[]
    loading: boolean
    loadingMore: boolean
    error: string | null
    hasMore: boolean
    loadMore: () => void
    search: string
    setSearch: (s: string) => void
}

export function useGraph(): UseGraphResult {
    const [tracks, setTracks] = useState<Track[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [skip, setSkip] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [search, setSearch] = useState('')
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const fetchPage = useCallback(async (pageSkip: number, replace: boolean) => {
        replace ? setLoading(true) : setLoadingMore(true)
        try {
            const result = await execute(GetTracksDocument, { first: PAGE_SIZE, skip: pageSkip }) as any
            if (result.errors?.length) throw new Error(result.errors[0].message)
            const normalized = normalizeResults(result.data ?? {})
            setTracks(prev => {
                const next = replace ? normalized : [...prev, ...normalized]
                return dedup(next)  // dedup on the way into state too
            })
            setHasMore(normalized.length === PAGE_SIZE)
        } catch (e: any) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            replace ? setLoading(false) : setLoadingMore(false)
        }
    }, [])

    const fetchSearch = useCallback(async (term: string) => {
        setLoading(true)
        setHasMore(false)
        try {
            const result = await execute(SearchTracksDocument, { search: term }) as any
            if (result.errors?.length) throw new Error(result.errors[0].message)
            setTracks(normalizeSearchResults(result.data ?? {}, term))
        } catch (e: any) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPage(0, true)
    }, [fetchPage])

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (!search.trim()) {
            setSkip(0)
            setHasMore(true)
            fetchPage(0, true)
            return
        }
        debounceRef.current = setTimeout(() => fetchSearch(search.trim()), 350)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [search, fetchPage, fetchSearch])

    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore || search.trim()) return
        const next = skip + PAGE_SIZE
        setSkip(next)
        fetchPage(next, false)
    }, [loadingMore, hasMore, skip, search, fetchPage])

    return { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch }
}