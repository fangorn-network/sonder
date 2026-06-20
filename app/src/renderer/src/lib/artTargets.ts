/**
 * lib/artTargets.ts
 *
 * Works out which artists / albums in a set of labeled tracks still have no
 * stored artwork — the input to <ArtworkFixerGrid>. Shared by the post-import
 * "Add artwork" step (scoped to the just-imported tracks) and the Library's
 * "Artwork" tab (the whole library). Presence is checked against the normalized
 * key set from `listArtKeys`, matching how main stores keys (see lib/artKeys.ts).
 */

import type { ArtScope, LocalTrack } from '../providers/LocalMusicProvider'
import { artistArtKey, albumArtKeyOf, normalizeArtKey } from './artKeys'

/** Something that may need artwork: an artist, or an album (always carries its
 *  artist so the album art key — and the online search — can be built). */
export interface ArtTarget {
  scope: ArtScope
  artist: string
  /** Album display name — required for, and only present on, album targets. */
  album?: string
}

/** Distinct artists + albums from `tracks` that aren't in the stored-art set
 *  `have` (from `listArtKeys`). Artists first, then albums, each name-sorted. */
export function missingArtTargets(
  tracks: LocalTrack[],
  have: { artist: string[]; album: string[] }
): ArtTarget[] {
  const haveArtist = new Set(have.artist)
  const haveAlbum = new Set(have.album)

  // Dedupe by normalized key, keeping the first display spelling we see.
  const artists = new Map<string, string>()
  const albums = new Map<string, { artist: string; album: string }>()

  for (const t of tracks) {
    const artist = t.artist?.trim()
    if (!artist) continue
    const aKey = normalizeArtKey(artistArtKey(artist))
    if (!haveArtist.has(aKey) && !artists.has(aKey)) artists.set(aKey, artist)

    const album = t.album?.trim()
    if (album) {
      const alKey = normalizeArtKey(albumArtKeyOf(artist, album))
      if (!haveAlbum.has(alKey) && !albums.has(alKey)) albums.set(alKey, { artist, album })
    }
  }

  const out: ArtTarget[] = []
  for (const artist of [...artists.values()].sort((a, b) => a.localeCompare(b))) {
    out.push({ scope: 'artist', artist })
  }
  for (const { artist, album } of [...albums.values()].sort((a, b) =>
    a.album.localeCompare(b.album)
  )) {
    out.push({ scope: 'album', artist, album })
  }
  return out
}
