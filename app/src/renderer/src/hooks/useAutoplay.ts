import { useCallback, useRef, useState } from 'react'
import type { Track } from '../types'
import { asTrack } from '../types'
import { toRecordVM } from '../domain/recordVM'
import { getCachedSchema } from '../domain/roles'
import type { WeightedHit } from '../kernel/types'

// The kernel's ChromaHit type says `metadata` but the actual server
// response shape has `fields` — same as every other chroma result in the app.
// Cast to any to read what's actually there, then project through roles.
function hitToTrack(wh: WeightedHit): Track | null {
  const raw = wh as any
  if (!raw.fields) return null
  const vm = toRecordVM({ ...raw, score: wh.weight, distance: wh.distance }, getCachedSchema()?.roles ?? null)
  return asTrack(vm)
}

export function useAutoplay(
  kernel: { sampleNext: () => Promise<{ pick: WeightedHit } | null> },
  play:   (track: Track) => Promise<void>,
) {
  const [nextTrack, setNextTrack] = useState<Track | null>(null)
  const nextRef     = useRef<Track | null>(null)
  const fetchingRef = useRef(false)

  const prefetchNext = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const result = await kernel.sampleNext()
      if (!result) return
      const track = hitToTrack(result.pick)
      if (!track) return
      nextRef.current = track
      setNextTrack(track)
    } catch (e) {
      console.warn('[autoplay] prefetch failed:', e)
    } finally {
      fetchingRef.current = false
    }
  }, [kernel])

  const playNext = useCallback(async () => {
    const track = nextRef.current
    nextRef.current = null
    setNextTrack(null)

    if (track) {
      await play(track)
      prefetchNext()
    } else {
      try {
        const result = await kernel.sampleNext()
        if (!result) return
        const t = hitToTrack(result.pick)
        if (!t) return
        await play(t)
        prefetchNext()
      } catch (e) {
        console.warn('[autoplay] playNext failed:', e)
      }
    }
  }, [play, prefetchNext, kernel])

  return { nextTrack, prefetchNext, playNext }
}