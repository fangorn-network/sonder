import { useState, useEffect, useCallback, useRef } from 'react'
import { execute } from '../../.graphclient'
import { GetTagsDocument, GetAllTagsForSearchDocument } from '../../.graphclient'
import type { Track } from '../types'

const PAGE_SIZE = 20
const SEARCH_BATCH = 100

// ── normalization ────────────────────────────────────────────────────────────

function normalizeManifestState(state: any): Track[] {
  const { id: stateId, owner, schemaName, manifest } = state
  if (!manifest?.files) return []

  return manifest.files.map((file: any, i: number) => {
    // array fields come through as multiple FileField rows with the same name
    const grouped: Record<string, string[]> = {}
    for (const f of file.fileFields ?? []) {
      const name = f.name ?? ''
      if (!grouped[name]) grouped[name] = []
      grouped[name].push(f.value ?? '')
    }

    const str = (key: string): string | null => grouped[key]?.[0] ?? null
    const num = (key: string): number | null => {
      const v = parseFloat(grouped[key]?.[0] ?? '')
      return isNaN(v) ? null : v
    }
    const arr = (key: string): string[] => grouped[key] ?? []

    const name = file.name ?? `entry-${i}`
    return {
      id: `${stateId}-${name}-${i}`,
      manifestStateId: stateId,
      mbid: str('mbid'),
      title: str('title') ?? name,
      artist: str('artist') ?? owner.slice(0, 8) + '…',
      year: num('year'),
      energy: num('energy'),
      genres: arr('genres'),
      moods: arr('moods'),
      themes: arr('themes'),
      contexts: arr('contexts'),
      owner,
      datasourceName: schemaName,
      name,
    } satisfies Track
  })
}

function normalizeResults(data: any): Track[] {
  return dedup((data.manifestStates ?? []).flatMap(normalizeManifestState))
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    if (!seen.has(t.mbid!)) seen.set(t.mbid!, t)
  }
  return Array.from(seen.values())
}

function matchesSearch(track: Track, lower: string): boolean {
  return (
    track.title.toLowerCase().includes(lower) ||
    track.artist.toLowerCase().includes(lower) ||
    track.genres.some(g => g.toLowerCase().includes(lower)) ||
    track.moods.some(m => m.toLowerCase().includes(lower)) ||
    track.themes.some(t => t.toLowerCase().includes(lower)) ||
    track.contexts.some(c => c.toLowerCase().includes(lower))
  )
}

// ── hook ─────────────────────────────────────────────────────────────────────

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
      const result = await execute(GetTagsDocument, { first: PAGE_SIZE, skip: pageSkip }) as any
      if (result.errors?.length) throw new Error(result.errors[0].message)
      const raw: any[] = result.data?.manifestStates ?? []
      const normalized = normalizeResults(result.data ?? {})
      setTracks(prev => dedup(replace ? normalized : [...prev, ...normalized]))
      setHasMore(raw.length === PAGE_SIZE)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      replace ? setLoading(false) : setLoadingMore(false)
    }
  }, [])

  const fetchSearch = useCallback(async (term: string) => {
    setLoading(true)
    setHasMore(false)
    const lower = term.toLowerCase()
    const accumulated: Track[] = []
    let pageSkip = 0
    try {
      while (true) {
        const result = await execute(GetAllTagsForSearchDocument, {
          first: SEARCH_BATCH,
          skip: pageSkip,
        }) as any
        if (result.errors?.length) throw new Error(result.errors[0].message)
        const raw: any[] = result.data?.manifestStates ?? []
        const normalized = normalizeResults(result.data ?? {})
        accumulated.push(...normalized.filter(t => matchesSearch(t, lower)))
        if (raw.length < SEARCH_BATCH) break
        pageSkip += SEARCH_BATCH
      }
      setTracks(dedup(accumulated))
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPage(0, true) }, [fetchPage])

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