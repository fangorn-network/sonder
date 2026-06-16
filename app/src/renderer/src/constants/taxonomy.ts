/**
 * constants/taxonomy.ts
 *
 * The controlled vocabulary for semantic track tags, shaped to
 * schemas/TrackTaxonomySchema.json (genres / moods / themes / contexts). Single
 * source of truth shared by the network tag editor (components/TrackTag.tsx) and
 * the local-first tag editor (components/LocalTrackTagEditor.tsx).
 */

export const TAXONOMY = {
  genres: [
    'ambient', 'art rock', 'avant-garde', 'black metal', 'bluegrass',
    'blues', 'bossa nova', 'chiptune', 'classical', 'darkwave',
    'death metal', 'disco', 'doom metal', 'dream pop', 'drone',
    'dub', 'electronic', 'emo', 'experimental', 'field recordings',
    'folk', 'footwork', 'funk', 'garage rock', 'gothic rock',
    'grunge', 'hardcore', 'hip-hop', 'house', 'industrial',
    'jazz', 'krautrock', 'lo-fi', 'math-rock', 'metalcore',
    'minimal techno', 'new wave', 'noise rock', 'post-metal', 'post-punk',
    'post-rock', 'power electronics', 'progressive rock', 'psychedelic', 'punk',
    'r&b', 'reggae', 'shoegaze', 'slowcore', 'soul',
    'space rock', 'spiritual jazz', 'stoner rock', 'synthwave', 'techno',
    'thrash metal', 'trip-hop', 'vaporwave', 'witch house',
  ],
  moods: [
    'aggressive', 'anxious', 'bitter', 'cathartic', 'cinematic',
    'cold', 'dark', 'defiant', 'dissonant', 'dreamy',
    'ecstatic', 'euphoric', 'frantic', 'hopeful', 'hypnotic',
    'introspective', 'lonely', 'meditative', 'melancholic', 'mournful',
    'nostalgic', 'otherworldly', 'peaceful', 'playful', 'raw',
    'restless', 'serene', 'solemn', 'tender', 'tense',
    'triumphant', 'unsettling', 'warm', 'weary', 'wistful',
  ],
  contexts: [
    'background', 'commute', 'creative work', 'deep focus', 'driving',
    'exploration', 'gaming', 'heartbreak', 'insomnia', 'late night',
    'meditation', 'movement', 'party', 'pre-show', 'ritual',
    'running', 'social', 'solitude', 'study', 'walking', 'workout',
  ],
  themes: [
    'absurdity', 'body', 'chaos', 'class', 'community',
    'death', 'dreams', 'empire', 'excess', 'faith',
    'fear', 'freedom', 'grief', 'home', 'hunger',
    'identity', 'isolation', 'love', 'memory', 'myth',
    'nature', 'obsession', 'place', 'power', 'rage',
    'resistance', 'ritual', 'shadow', 'spirituality', 'technology',
    'time', 'urban', 'war', 'work', 'youth',
  ],
} as const

export type Dimension = keyof typeof TAXONOMY

export const DIMENSION_LABELS: Record<Dimension, string> = {
  genres: 'Genres',
  moods: 'Moods',
  contexts: 'Contexts',
  themes: 'Themes',
}

export const DIMENSION_ORDER: Dimension[] = ['genres', 'moods', 'contexts', 'themes']

/** Max selections allowed per dimension. */
export const MAX_PER_DIM = 3

/** schemaVersion written for a TrackTaxonomySchema record. */
export const TAXONOMY_SCHEMA_VERSION = 1
