import { useState, useEffect, useCallback, useRef } from 'react'
import { execute } from '../../.graphclient'
import { GetTracksDocument, SearchTracksDocument } from '../../.graphclient'
import type { GetTracksQuery, SearchTracksQuery } from '../../.graphclient'
import type { Track } from '../types'

const PAGE_SIZE = 10

function normalizeManifestState(state: any): Track[] {
    const { owner, schema_name, manifest } = state
    if (!manifest?.files) return []
    return manifest.files.map((file: any, i: number) => {
        const fields: Record<string, any> = {}
        for (const f of file.fields ?? []) {
            fields[f.name ?? ''] = f
        }
        const tag = fields['audio']?.value ?? `track-${i}`
        const price = fields['audio']?.price ?? null
        return {
            id: `${owner}-${tag}`,
            title:          fields['title']?.value    ?? tag,
            artist:         fields['artist']?.value   ?? owner.slice(0, 8) + '…',
            album:          fields['album']?.value    ?? schema_name,
            trackNumber:    fields['trackNumber']?.value ?? null,
            duration:       fields['duration']?.value ?? '—',
            genre:          fields['genre']?.value    ?? '',
            owner,
            datasourceName: schema_name,
            tag,
            art:            fields['cover_art']?.value ?? null,
            price:          price?.price    ?? '0',
            currency:       price?.currency ?? 'USDC',
            acc:            fields['audio']?.acc ?? null,
        } satisfies Track
    })
}

function normalizeResults(data: GetTracksQuery): Track[] {
    return (data.manifestStates ?? []).flatMap(normalizeManifestState)
}

const SEARCH_FIELDS = new Set(['artist', 'title', 'album', 'genre'])

function normalizeSearchResults(data: SearchTracksQuery, term: string): Track[] {
    const seen  = new Set<string>()
    const lower = term.toLowerCase()

    const allFields = [
        ...(data.byArtist ?? []),
        ...(data.byTitle  ?? []),
        ...(data.byAlbum  ?? []),
        ...(data.byGenre  ?? []),
    ]

    return allFields
        .filter(Boolean)
        .flatMap((f: any) => {
            const state = f.manifestState
            if (!state?.manifest?.files) return []

            return state.manifest.files
                .filter((file: any) =>
                    (file.fields ?? []).some((field: any) =>
                        SEARCH_FIELDS.has(field.name) &&
                        field.value?.toLowerCase().includes(lower)
                    )
                )
                .map((file: any, i: number) => {
                    const fields: Record<string, any> = {}
                    for (const field of file.fields ?? []) {
                        fields[field.name ?? ''] = field
                    }
                    const tag   = fields['audio']?.value ?? `track-${i}`
                    const price = fields['audio']?.price ?? null
                    const track: Track = {
                        id:             `${state.owner}-${tag}`,
                        title:          fields['title']?.value    ?? tag,
                        artist:         fields['artist']?.value   ?? state.owner.slice(0, 8) + '…',
                        album:          fields['album']?.value    ?? state.schema_name,
                        trackNumber:    fields['trackNumber']?.value ?? null,
                        duration:       fields['duration']?.value ?? '—',
                        genre:          fields['genre']?.value    ?? '',
                        owner:          state.owner,
                        datasourceName: state.schema_name,
                        tag,
                        art:            fields['cover_art']?.value ?? null,
                        price:          price?.price    ?? '0',
                        currency:       price?.currency ?? 'USDC',
                        acc:            fields['audio']?.acc ?? null,
                    }
                    return track
                })
        })
        .filter(t => {
            if (seen.has(t.id)) return false
            seen.add(t.id)
            return true
        })
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
    const [tracks, setTracks]           = useState<Track[]>([])
    const [loading, setLoading]         = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError]             = useState<string | null>(null)
    const [skip, setSkip]               = useState(0)
    const [hasMore, setHasMore]         = useState(true)
    const [search, setSearch]           = useState('')
    const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
    const cancelledRef = useRef(false)

    const fetchPage = useCallback(async (pageSkip: number, replace: boolean) => {
        replace ? setLoading(true) : setLoadingMore(true)
        try {
            const result = await Promise.resolve(
                execute(GetTracksDocument, { first: PAGE_SIZE, skip: pageSkip })
            ) as any
            if (cancelledRef.current) return
            if (result.errors?.length) throw new Error(result.errors[0].message)
            const normalized = normalizeResults(result.data ?? {})
            setTracks(prev => replace ? normalized : [...prev, ...normalized])
            setHasMore(normalized.length === PAGE_SIZE)
        } catch (e: any) {
            if (!cancelledRef.current) setError(e instanceof Error ? e.message : String(e))
        } finally {
            if (!cancelledRef.current) replace ? setLoading(false) : setLoadingMore(false)
        }
    }, [])

    const fetchSearch = useCallback(async (term: string) => {
        setLoading(true)
        setHasMore(false)
        try {
            const result = await Promise.resolve(
                execute(SearchTracksDocument, { search: term })
            ) as any
            if (cancelledRef.current) return
            if (result.errors?.length) throw new Error(result.errors[0].message)
            setTracks(normalizeSearchResults(result.data ?? {}, term))
        } catch (e: any) {
            if (!cancelledRef.current) setError(e instanceof Error ? e.message : String(e))
        } finally {
            if (!cancelledRef.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        cancelledRef.current = false
        fetchPage(0, true)
        return () => { cancelledRef.current = true }
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