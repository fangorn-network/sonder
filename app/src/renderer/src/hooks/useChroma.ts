import { useState, useEffect, useCallback, useRef } from 'react'
import type { Track } from '../types'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'
const PAGE_SIZE = 20

// ── normalization ─────────────────────────────────────────────────────────────

function parseDocument(doc: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const part of doc.split(' | ')) {
    const colon = part.indexOf(': ')
    if (colon === -1) continue
    fields[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
  }
  return fields
}

function normalizeHit(hit: any): Track | null {
  const f = parseDocument(hit.document ?? '')
  const str = (key: string): string | null => f[key] ?? null
  const num = (key: string): number | null => {
    const v = parseFloat(f[key] ?? '')
    return isNaN(v) ? null : v
  }
  const arr = (key: string): string[] =>
    f[key] ? f[key].split(',').map((s: string) => s.trim()).filter(Boolean) : []

  const title  = str('title') ?? str('name') ?? 'Unknown'
  const artist = str('artist') ?? (hit.owner?.slice(0, 8) + '…')

  return {
    id:              hit.id,
    manifestStateId: hit.manifestCid,
    mbid:            str('mbid'),
    title,
    artist,
    year:            num('year'),
    energy:          num('energy'),
    genres:          arr('genres'),
    moods:           arr('moods'),
    themes:          arr('themes'),
    contexts:        arr('contexts'),
    owner:           hit.owner ?? '',
    datasourceName:  hit.schemaId ?? '',
    name:            str('name') ?? title,
  } satisfies Track
}

function dedup(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) {
    const key = t.mbid ?? t.id
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

// ── api ───────────────────────────────────────────────────────────────────────

async function chromaBrowse(offset: number): Promise<{ results: any[], total: number }> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  const resp = await fetch(`${CHROMA_URL}/browse?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  return resp.json()
}

async function chromaSearch(query: string, nResults = 50): Promise<any[]> {
  const params = new URLSearchParams({ q: query, n_results: String(nResults) })
  const resp = await fetch(`${CHROMA_URL}/search?${params}`)
  if (!resp.ok) throw new Error(`Chroma error: ${resp.status}`)
  const data = await resp.json()
  return data.results ?? []
}

// ── hook ──────────────────────────────────────────────────────────────────────

export interface UseChromaOptions {
  initialQuery?: string  // if set, first load uses semantic search instead of browse
}

export interface UseChromaResult {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
}

export function useChroma({ initialQuery }: UseChromaOptions = {}): UseChromaResult {
  const [tracks, setTracks]           = useState<Track[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [hasMore, setHasMore]         = useState(true)

  const pageCache    = useRef<Map<number, Track[]>>(new Map())
  const offsetRef    = useRef(0)
  const totalRef     = useRef<number | null>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeQuery  = useRef('')
  const loadingRef   = useRef(false)
  const initialQueryRef = useRef(initialQuery) // stable ref, doesn't re-trigger effects
  const isSearching  = search.trim().length > 0

  const loadPage = useCallback(async (offset: number) => {
    if (loadingRef.current) return
    loadingRef.current = true

    if (pageCache.current.has(offset)) {
      const cached = pageCache.current.get(offset)!
      setTracks(prev => dedup([...prev, ...cached]))
      offsetRef.current = offset
      const total = totalRef.current
      setHasMore(total === null || offset + PAGE_SIZE < total)
      loadingRef.current = false
      return
    }

    setLoadingMore(offset > 0)
    if (offset === 0) setLoading(true)

    try {
      const { results, total } = await chromaBrowse(offset)
      totalRef.current = total
      const normalized = results.map(normalizeHit).filter(Boolean) as Track[]
      pageCache.current.set(offset, normalized)
      offsetRef.current = offset
      setTracks(prev => dedup(offset === 0 ? normalized : [...prev, ...normalized]))
      setHasMore(offset + PAGE_SIZE < total)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
      loadingRef.current = false
    }
  }, [])

  // initial load — use taste profile query if available, else browse
  useEffect(() => {
    const q = initialQueryRef.current?.trim()
    if (q) {
      setLoading(true)
      chromaSearch(q, 100)
        .then(hits => {
          const normalized = dedup(hits.map(normalizeHit).filter(Boolean) as Track[])
          // store as page 0 so loadMore can append browse pages after
          pageCache.current.set(0, normalized)
          offsetRef.current = 0
          setTracks(normalized)
          // after profile results, subsequent loadMore pages come from browse
          setHasMore(true)
        })
        .catch(e => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false))
    } else {
      loadPage(0)
    }
  }, [loadPage])

  // search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const q = search.trim()
      if (!q) {
        // restore browse mode from cache
        activeQuery.current = ''
        const cached = Array.from(pageCache.current.entries())
          .sort(([a], [b]) => a - b)
          .flatMap(([, tracks]) => tracks)
        setTracks(dedup(cached))
        setHasMore(totalRef.current === null || offsetRef.current + PAGE_SIZE < (totalRef.current ?? 0))
        return
      }
      activeQuery.current = q
      setLoading(true)
      try {
        const hits = await chromaSearch(q)
        if (activeQuery.current !== q) return
        setTracks(dedup(hits.map(normalizeHit).filter(Boolean) as Track[]))
        setHasMore(false)
      } catch (e: any) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || isSearching) return
    loadPage(offsetRef.current + PAGE_SIZE)
  }, [loadingMore, hasMore, isSearching, loadPage])

  return { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch }
}