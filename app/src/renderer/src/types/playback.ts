// TODO: should this be yt-dlp instead?
export type SourceId = 'youtube' 
// can extenbd in the future: 'soundcloud' | 'podcast' | 'url' | ...

export interface PlaybackSource {
  id: SourceId
  // soundcloud track id | youtube video id | url | ...
  address: string
}

export interface PlaybackState {
  activeSource: SourceId | null
  playing: boolean
  trackId: string | null
}

export interface PlaybackProvider {
  id: SourceId
  label: string
  // for the UI indicator
  color: string
  isAvailable: () => boolean
  play: (address: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
}