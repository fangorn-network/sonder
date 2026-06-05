/**
 * main/playback/registry.ts
 *
 * Holds the set of available playback adapters and tracks which one is active.
 * Adding a new source (Local / Apple Music / Tidal) is just a `register()` call.
 */

import type { PlaybackAdapter, SourceInfo } from './types'

const adapters = new Map<string, PlaybackAdapter>()
let activeId: string | null = null

export function register(adapter: PlaybackAdapter): void {
  adapters.set(adapter.id, adapter)
  // First registered adapter becomes the default active source.
  if (activeId === null) activeId = adapter.id
}

export function setActive(id: string): boolean {
  if (!adapters.has(id)) return false
  activeId = id
  return true
}

export function getActive(): PlaybackAdapter {
  if (!activeId) throw new Error('[playback] no adapters registered')
  const a = adapters.get(activeId)
  if (!a) throw new Error(`[playback] active source "${activeId}" not found`)
  return a
}

export function getActiveId(): string | null {
  return activeId
}

export async function list(): Promise<SourceInfo[]> {
  return Promise.all(
    [...adapters.values()].map(async (a) => ({
      id: a.id,
      label: a.label,
      available: await a.isAvailable().catch(() => false),
    })),
  )
}
