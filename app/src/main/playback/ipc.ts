/**
 * main/playback/ipc.ts
 *
 * Generic, source-agnostic playback IPC. All handlers delegate to the active
 * adapter from the registry, so the renderer never names a specific source for
 * transport — it just talks `playback:*` and optionally switches sources.
 */

import { ipcMain } from 'electron'
import * as registry from './registry'
import { SpotifyAdapter } from './SpotifyAdapter'
import type { PlaybackTrack } from './types'

export function registerPlaybackIpc(): void {
  // Register the built-in sources. Spotify first → it becomes the default.
  registry.register(new SpotifyAdapter())

  console.log('[playback] sources:', registry.getActiveId())

  ipcMain.handle('playback:sources',    () => registry.list())
  ipcMain.handle('playback:active',     () => registry.getActiveId())
  ipcMain.handle('playback:set-source', (_e, id: string) => registry.setActive(id))

  ipcMain.handle('playback:play', async (_e, track: PlaybackTrack) => {
    try {
      return await registry.getActive().play(track)
    } catch (err) {
      console.error('[playback] play failed:', err)
      throw err
    }
  })

  ipcMain.handle('playback:pause',  () => registry.getActive().pause())
  ipcMain.handle('playback:resume', () => registry.getActive().resume())
  ipcMain.handle('playback:stop',   () => registry.getActive().stop())
  ipcMain.handle('playback:seek',   (_e, ms: number)  => registry.getActive().seek(ms))
  ipcMain.handle('playback:volume', (_e, pct: number) => registry.getActive().setVolume(pct))
  ipcMain.handle('playback:status', () => registry.getActive().status())
}
