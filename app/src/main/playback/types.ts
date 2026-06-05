/**
 * main/playback/types.ts
 *
 * The playback-source abstraction. Every source SOND3R can play through —
 * Spotify (desktop app), and later Local files / Apple Music / Tidal — implements
 * PlaybackAdapter. The renderer talks to whichever adapter is "active" through a
 * single generic `playback:*` IPC namespace (see ./ipc.ts), so swapping sources is
 * a registry change, not a renderer rewrite.
 */

/** A track to play, described independently of any one source. */
export interface PlaybackTrack {
  title: string
  artist: string
  /** Optional resolution hints — an adapter uses what it understands, ignores the rest. */
  spotifyUri?: string
  youtubeVideoId?: string
  durationMs?: number
}

/** Live transport state, polled by the renderer. */
export interface PlaybackStatus {
  isPlaying: boolean
  progressMs: number
  durationMs: number
  trackId: string | null
  title: string | null
  artist: string | null
  thumb: string | null
}

export const EMPTY_STATUS: PlaybackStatus = {
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  trackId: null,
  title: null,
  artist: null,
  thumb: null,
}

export interface PlayResult {
  durationMs: number
}

/** Metadata describing a source for the renderer's source picker. */
export interface SourceInfo {
  id: string
  label: string
  available: boolean
}

/**
 * The contract every playback source implements. Transport methods are best-effort:
 * `play` returns null when it cannot resolve/start the track; the others resolve once
 * the command has been dispatched.
 */
export interface PlaybackAdapter {
  readonly id: string
  readonly label: string

  /** Whether this source can be used right now (binary present, platform supported, …). */
  isAvailable(): Promise<boolean>

  play(track: PlaybackTrack): Promise<PlayResult | null>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  seek(ms: number): Promise<void>
  setVolume(pct: number): Promise<void>
  status(): Promise<PlaybackStatus>
}
