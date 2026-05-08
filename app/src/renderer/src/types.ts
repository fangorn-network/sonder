import type { CSSProperties } from 'react'

export interface Track {
  // Fangorn manifest fields
  id: string                  // manifestStateId / Chroma doc id
  manifestStateId: string
  datasourceName: string
  owner: string
  name: string                // raw name field from manifest
  embedding: any

  // Corpus fields (from fetch.py output)
  spotify_track_id: string
  spotify_artist_id: string | null
  title: string
  artist: string
  year: number | null
  rank: number | null
  duration_ms: number | null
  preview_url: string | null

  // Taxonomy
  genres: string[]
  moods: string[]
  themes: string[]
  contexts: string[]
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