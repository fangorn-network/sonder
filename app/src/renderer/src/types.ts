import type { CSSProperties } from 'react'

export interface JoinedRecord {
  // Fangorn envelope
  id: string
  trackId: string
  owner: string
  manifestCid: string
  // Joined fields — shape driven by schemas
  fields: Record<string, FieldValue>
  // Kernel
  embedding?: number[]
  score?: number
  distance?: number
}

export interface FieldValueObject {
  [key: string]: FieldValue
}

export type FieldValue =
  | string | number | boolean | null
  | FieldValue[]
  | FieldValueObject

export function asTrack(r: JoinedRecord): Track {
  const f = r.fields
  const contributors = Array.isArray(f.contributors)
    ? (f.contributors as any[]).map(c => ({
      role: c.role ?? null,
      name: c.name ?? null,
      id: c.id ?? null,
    }))
    : []

  return {
    id: r.id,
    trackId: r.trackId,
    owner: r.owner,
    manifestCid: r.manifestCid,
    title: (f.title as string) ?? 'Unknown',
    artist: (f.byArtist as string) ?? '',
    year: typeof f.datePublished === 'string' && f.datePublished
      ? parseInt(f.datePublished.slice(0, 4)) || null
      : null,
    durationMs: (f.durationMs as number) ?? null,
    spotifyTrackId: (f.externalId as string) ?? null,
    contributors,
    embedding: r.embedding,
  }
}

export interface Track {
  id: string
  trackId: string
  owner: string
  manifestCid: string
  title: string
  artist: string
  year: number | null
  durationMs: number | null
  spotifyTrackId: string | null
  contributors?: { role: string | null; name: string | null; id: string | null }[]
  embedding?: number[]
  genres?: string[]
  moods?: string[]
  themes?: string[]
  contexts?: string[]
  youtubeVideoId?: string
  thumbnailUrl?: string
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'error'
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
export type ViewName = 'Discover' | 'Library' | 'Agent'
export type UploadPanel = 'upload' | 'manage'

export interface ManifestEntry {
  name: string
  cid: string
  index: number
  extension: string
  fileType: string
  gadgetDescriptor: unknown
}

export interface AlbumView {
  name: string
  manifestCid: string
  entries: ManifestEntry[]
}

export interface HueStyle extends CSSProperties {
  '--hue': number
}

export interface RecommendedTracks {
  tracks: Track[]
  sourceId: string
  sourceTitle: string
}

export interface TasteProfile {
  genres: Record<string, number>
  moods: Record<string, number>
  contexts: Record<string, number>
  energyRange: [number, number] | null
  topArtists: string[]
  topTracks: { title: string; artist: string; genres: string[] }[]
  seededFromSpotify: boolean
  lastUpdated: number
  entropy: number
}

export type SignalType = 'play' | 'skip' | 'like' | 'filter' | 'similar'

export interface TasteSignal {
  type: SignalType
  track: Track
  weight: number  // play=1, skip=-1, filter=0.5, like=1.5, similar=0.75
}