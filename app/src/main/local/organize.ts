/**
 * main/local/organize.ts
 *
 * Auto-organizer for messy imports. For every Unlabeled track it resolves
 * artist / title / album through a HIERARCHY of sources, best first:
 *
 *   artist:  embedded tag → "Artist - Title" filename → containing folder name
 *   title:   embedded tag → filename → nearest non-generic ancestor folder
 *            (so own-productions named "Mixdown.mp3" under …/PeaceMaker/Mixdown/
 *            become "PeaceMaker")
 *   album:   embedded tag → (none)
 *
 * Everything is cleaned (whitespace collapsed, "Last, First" un-flipped, diacritics
 * folded for matching) and then MERGED: variant spellings of the same artist/album
 * collapse to one canonical display name (seeded by the names already in the
 * Library, which win), and tracks that resolve to the same artist+title are treated
 * as duplicates and skipped. Names that look like the same artist but differ too
 * much to merge safely (e.g. "AC DC" vs "ACDC") are returned as review suggestions
 * rather than auto-merged.
 *
 * Resolvable tracks are written via catalog.upsertMeta (moving them into the
 * Library); the rest are left Unlabeled for manual labeling.
 */

import path from 'path'
import { listMeta, readEmbeddedTags, setArtistName, upsertMeta } from './catalog'
import { renameArtistArt } from './art'
import { listRegistry } from './LocalLibrary'
import type { MergeSuggestion, OrganizeProgress, OrganizeReport } from './types'

// ─── Text helpers ─────────────────────────────────────────────────────────────

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()

const stripDiacritics = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Matching key: lowercase, diacritics folded, punctuation → space, leading
 *  "the " dropped. Folds "AeroSmith"/"Aerosmith", "ACDC "/"ACDC", "The X"/"X". */
function canonKey(name: string): string {
  let s = stripDiacritics(name).toLowerCase()
  s = s.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim().replace(/^the /, '')
  return s
}

/** Tighter key (no spaces) — catches space-only variants like "AC DC" vs "ACDC"
 *  for review suggestions; too aggressive to auto-merge on. */
const tightKey = (name: string): string => canonKey(name).replace(/\s+/g, '')

/** "Aguilera, Christina" → "Christina Aguilera". Skips "Earth, Wind & Fire",
 *  "Tyler, The Creator", and many-word sides. */
function unflipName(name: string): string {
  const m = name.match(/^([^,]+),\s*([^,]+)$/)
  if (!m) return name
  const last = m[1].trim()
  const first = m[2].trim()
  if (/&|\band\b/i.test(name)) return name
  if (/^the\b/i.test(first) || /^the\b/i.test(last)) return name
  if (last.split(/\s+/).length > 3 || first.split(/\s+/).length > 2) return name
  return `${first} ${last}`
}

// Folder / file names that carry no real song info — skip them as artist/title.
const GENERIC = new Set([
  'mixdown', 'master', 'mastered', 'final', 'bounce', 'export', 'render', 'audio',
  'track', 'untitled', 'recording', 'new recording', 'media', 'mp3', 'wav', 'flac',
  'song', 'songs', 'music', 'unknown', 'unknown artist', 'unknown album', 'cache',
  'history', 'images', 'goody',
])
function isGeneric(name: string): boolean {
  const k = canonKey(name)
  if (!k) return true
  const base = k.replace(/\s*\d+$/, '').trim() // "mixdown 2" → "mixdown"
  return GENERIC.has(k) || GENERIC.has(base)
}

// ─── Per-file resolution ────────────────────────────────────────────────────

interface Parsed { artist: string | null; title: string | null }

/** Derive artist/title from a filename, handling the common messy shapes:
 *  "045. Artist - Title", "02 - Artist - Title", "Artist - 07 - Title",
 *  "08 Title", and scene-style "12-the_cure-like_cockatoos-tns". */
function parseFilename(absPath: string): Parsed {
  const raw = path.basename(absPath, path.extname(absPath))
  let base = raw.replace(/^\s*[([][^)\]]*[)\]]\s*/, '').trim()        // strip leading "(mp3)" / "[..]"
  base = base.replace(/^copy of\s+/i, '').trim()                      // "Copy of X" → "X"
  base = base.replace(/\s*\(\d+\)\s*$/, '').trim()                    // strip "(1)" dup marker
  base = base.replace(/\s*\(\s*\d{2,4}\s*k(?:bps)?\s*\)\s*$/i, '').trim() // strip "(192k)" bitrate

  const sceneStyle = !/\s/.test(base) && (base.match(/-/g)?.length ?? 0) >= 2
  base = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

  let artist: string | null = null
  let title: string | null = null

  if (sceneStyle) {
    const toks = base.split('-').map(clean).filter(Boolean)
    if (toks.length && /^\d{1,3}$/.test(toks[0])) toks.shift() // leading track no.
    if (toks.length > 2 && /^[a-z]{1,4}$/.test(toks[toks.length - 1])) toks.pop() // scene tag
    if (toks.length === 1) title = toks[0]
    else if (toks.length >= 2) { artist = toks[0]; title = toks.slice(1).join(' ') }
    return { artist: artist && clean(artist), title: title && clean(title) }
  }

  const tm = base.match(/^(\d{1,3})\s*[-._)]?\s+(.*)$/) // leading track number
  if (tm) base = tm[2].trim()

  const parts = base.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 1) {
    title = parts[0]
  } else if (parts.length === 2) {
    artist = parts[0]; title = parts[1]
  } else {
    artist = parts[0]; title = parts[parts.length - 1] // "Artist - 07 - Title"
  }
  if (title) {
    const t2 = title.match(/^(\d{1,3})\s*[-._)]?\s+(.*)$/) // "07 Title"
    if (t2) title = t2[2].trim()
  }
  return { artist: artist && clean(artist), title: title && clean(title) }
}

/** Containing folder as artist, unless it's a generic dump folder. */
function folderArtist(absPath: string): string | null {
  const parent = path.basename(path.dirname(absPath))
  return parent && !isGeneric(parent) ? clean(unflipName(parent)) : null
}

/** Nearest non-generic ancestor folder — the song name for own-productions whose
 *  file is generic ("Mixdown") and whose project folder holds the real title. */
function folderTitle(absPath: string): string | null {
  let dir = path.dirname(absPath)
  for (let i = 0; i < 4; i++) {
    const name = path.basename(dir)
    if (!name || name === path.dirname(dir)) break
    if (!isGeneric(name)) return clean(name)
    dir = path.dirname(dir)
  }
  return null
}

interface Resolved {
  id: string
  path: string
  artist: string | null
  title: string | null
  album: string | null
  date: string | null
}

async function resolveOne(id: string, absPath: string): Promise<Resolved> {
  const tags = await readEmbeddedTags(absPath) // title falls back to the basename
  const parsed = parseFilename(absPath)
  const rawBase = clean(path.basename(absPath, path.extname(absPath))).toLowerCase()
  // readEmbeddedTags returns the basename as title when there's no real tag title.
  const tagTitleReal = !!tags.title && clean(tags.title).toLowerCase() !== rawBase

  let artist = clean(tags.byArtist) || parsed.artist || folderArtist(absPath)
  if (artist) artist = clean(unflipName(artist))

  let title = (tagTitleReal && clean(tags.title)) || parsed.title || null
  if (!title || isGeneric(title)) {
    const ft = folderTitle(absPath)
    if (ft && !isGeneric(ft)) title = ft
  }
  if (!title && tags.title) title = clean(tags.title) // last resort: filename basename

  return {
    id, path: absPath,
    artist: artist || null,
    title: title || null,
    album: tags.albumName ? clean(tags.albumName) : null,
    date: tags.datePublished,
  }
}

// ─── Canonical-name grouping ──────────────────────────────────────────────────

interface Group { variants: Map<string, number>; labeledDisplay: string | null }

function noteName(map: Map<string, Group>, name: string, fromLabeled: boolean): void {
  const k = canonKey(name)
  if (!k) return
  let g = map.get(k)
  if (!g) { g = { variants: new Map(), labeledDisplay: null }; map.set(k, g) }
  g.variants.set(name, (g.variants.get(name) ?? 0) + 1)
  if (fromLabeled && !g.labeledDisplay) g.labeledDisplay = name
}

/** The display spelling for a group: an existing Library spelling wins, else the
 *  most frequently seen variant. */
function groupDisplay(g: Group, fallback = ''): string {
  if (g.labeledDisplay) return g.labeledDisplay
  let best = fallback
  let bestN = -1
  for (const [variant, n] of g.variants) if (n > bestN) { best = variant; bestN = n }
  return best
}

function displayFor(map: Map<string, Group>, name: string): string {
  const g = map.get(canonKey(name))
  return g ? groupDisplay(g, name) : name
}

/** Number of variant spellings folded away (sum of variants-1 per merged group). */
function mergedCount(map: Map<string, Group>): number {
  let n = 0
  for (const g of map.values()) if (g.variants.size > 1) n += g.variants.size - 1
  return n
}

// ─── Orchestration ────────────────────────────────────────────────────────────

const RESOLVE_CONCURRENCY = 8

export async function autoOrganize(onProgress?: (p: OrganizeProgress) => void): Promise<OrganizeReport> {
  const labeled = listMeta()
  const unlabeled = listRegistry().filter((e) => !labeled.has(e.id))
  const total = unlabeled.length

  // 1) Resolve every unlabeled track (bounded concurrency for tag reads).
  const resolved: Resolved[] = []
  let processed = 0
  let next = 0
  const worker = async () => {
    while (next < unlabeled.length) {
      const e = unlabeled[next++]
      resolved.push(await resolveOne(e.id, e.path))
      onProgress?.({ total, processed: ++processed })
    }
  }
  await Promise.all(Array.from({ length: Math.min(RESOLVE_CONCURRENCY, total) }, worker))

  // 2) Canonical artist names — seed with the Library's existing names (authoritative).
  const artists = new Map<string, Group>()
  for (const m of labeled.values()) noteName(artists, m.byArtist, true)
  for (const r of resolved) if (r.artist) noteName(artists, r.artist, false)
  const artistOf = (name: string) => displayFor(artists, name)

  // 3) Canonical album names, keyed within their (canonical) artist.
  const albumGroupKey = (artist: string, album: string) => `${canonKey(artist)}||${canonKey(album)}`
  const albumGroups = new Map<string, Group>()
  for (const m of labeled.values()) if (m.albumName) noteName2(albumGroups, albumGroupKey(m.byArtist, m.albumName), m.albumName, true)
  for (const r of resolved) if (r.artist && r.album) noteName2(albumGroups, albumGroupKey(artistOf(r.artist), r.album), r.album, false)
  const albumOf = (artist: string, album: string) => displayFor2(albumGroups, albumGroupKey(artist, album), album)

  // 4) Near-duplicate artist suggestions (same tight key, different canonical key).
  const tight = new Map<string, Set<string>>()
  for (const g of artists.values()) {
    const display = groupDisplay(g)
    const tk = tightKey(display)
    if (!tk) continue
    const s = tight.get(tk) ?? new Set<string>()
    s.add(display)
    tight.set(tk, s)
  }
  const artistSuggestions: MergeSuggestion[] = []
  for (const set of tight.values()) {
    if (set.size > 1) {
      const variants = [...set].sort()
      artistSuggestions.push({ canonical: variants[0], variants })
    }
  }

  // 5) Write resolvable tracks, skipping duplicates (same canonical artist+title,
  //    including against the existing Library).
  const songKey = (artist: string, title: string) => `${canonKey(artist)}||${canonKey(title)}`
  const seenSongs = new Set<string>()
  for (const m of labeled.values()) seenSongs.add(songKey(m.byArtist, m.title))

  let labeledCount = 0
  let duplicates = 0
  // Local ids of the tracks left Unlabeled because they couldn't be resolved —
  // these are exactly the "needs review" tracks (duplicates are tracked
  // separately, not here), so the renderer can surface the same set it counts.
  const needsReviewIds: string[] = []
  for (const r of resolved) {
    if (!r.artist || !r.title) { needsReviewIds.push(r.id); continue }
    const artist = artistOf(r.artist)
    const sk = songKey(artist, r.title)
    if (seenSongs.has(sk)) { duplicates++; continue }
    seenSongs.add(sk)
    try {
      upsertMeta(r.id, r.path, {
        title: r.title,
        byArtist: artist,
        albumName: r.album ? albumOf(artist, r.album) : null,
        datePublished: r.date,
        isrcCode: null,
        durationMs: null,
        contributors: [],
      })
      labeledCount++
    } catch {
      needsReviewIds.push(r.id)
    }
  }

  return {
    processed: total,
    labeled: labeledCount,
    duplicates,
    needsReview: needsReviewIds.length,
    needsReviewIds,
    artistsMerged: mergedCount(artists),
    albumsMerged: mergedCount(albumGroups),
    artistSuggestions: artistSuggestions.slice(0, 20),
  }
}

/**
 * Resolve a "possible duplicate artists" suggestion: rewrite every labeled track
 * whose artist matches one of `variants` (by canonical key) to `canonical`, the
 * spelling the user picked, and re-home that artist's stored artwork. Reuses the
 * same canonKey the organizer groups by, so e.g. "God Smack", "god smack" and
 * "Godsmack" all collapse. Returns how many tracks were changed.
 */
export function mergeArtist(canonical: string, variants: string[]): number {
  const target = canonical.trim()
  if (!target) return 0
  // Match against every variant's canonical key, including the canonical's own
  // (so case-only twins of the chosen spelling normalize too).
  const keys = new Set([target, ...variants].map(canonKey))

  let changed = 0
  for (const m of listMeta().values()) {
    if (m.byArtist !== target && keys.has(canonKey(m.byArtist))) {
      setArtistName(m.localId, target)
      changed++
    }
  }
  // Move artist photo + album covers off the old spellings onto the canonical.
  renameArtistArt(variants, target)
  return changed
}

// Album groups are keyed by a composite (artist||album) string rather than a bare
// canonical name, so the generic group helpers take an explicit key here.
function noteName2(map: Map<string, Group>, key: string, display: string, fromLabeled: boolean): void {
  let g = map.get(key)
  if (!g) { g = { variants: new Map(), labeledDisplay: null }; map.set(key, g) }
  g.variants.set(display, (g.variants.get(display) ?? 0) + 1)
  if (fromLabeled && !g.labeledDisplay) g.labeledDisplay = display
}
function displayFor2(map: Map<string, Group>, key: string, fallback: string): string {
  const g = map.get(key)
  return g ? groupDisplay(g, fallback) : fallback
}
