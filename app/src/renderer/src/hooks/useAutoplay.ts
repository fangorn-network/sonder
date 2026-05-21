import { useCallback, useRef, useState } from 'react'
import type { Track, JoinedRecord } from '../types'
import { asTrack } from '../types'
import type { WeightedHit } from '../kernel/types'

// The kernel's ChromaHit type says `metadata` but the actual server
// response shape has `fields` — same as every other chroma result in the app.
// Cast to any to read what's actually there.
function hitToTrack(wh: WeightedHit): Track | null {
  const raw = wh as any
  if (!raw.fields) return null

  const record: JoinedRecord = {
    id:          raw.id,
    trackId:     raw.trackId ?? raw.fields?.trackId ?? raw.id.replace(/^track:/, ''),
    owner:       raw.owner       ?? '',
    manifestCid: raw.manifestCid ?? '',
    fields:      raw.fields,
    embedding:   raw.embedding,
    score:       wh.weight,
    distance:    wh.distance,
  }

  const track = asTrack(record)
  if (!track) return null

  return {
    ...track,
    genres:   Array.isArray(raw.fields.genres)   ? raw.fields.genres   : [],
    moods:    Array.isArray(raw.fields.moods)     ? raw.fields.moods    : [],
    themes:   Array.isArray(raw.fields.themes)    ? raw.fields.themes   : [],
    contexts: Array.isArray(raw.fields.contexts)  ? raw.fields.contexts : [],
  }
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