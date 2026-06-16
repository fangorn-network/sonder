/**
 * main/local/ipc.ts
 *
 * `local:*` IPC for on-disk music. Starts the file server and exposes the music
 * directory (default + persisted override), a native folder picker, and the
 * recursive scan. Playback itself happens in the renderer's <audio> element —
 * these handlers only locate files and hand back localhost stream URLs.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as lib from './LocalLibrary'
import * as catalog from './catalog'
import * as art from './art'
import * as favorites from './favorites'
import * as playlists from './playlists'
import type { ArtScope, LocalTrackMeta } from './types'
import type { FavKind } from './favorites'

export function registerLocalMusicIpc(): void {
  void lib.startLocalFileServer()

  ipcMain.handle('local:default-dir', () => lib.getDefaultMusicDir())
  ipcMain.handle('local:get-dir', () => lib.getSavedDir())

  ipcMain.handle('local:pick-dir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const opts = {
      title: 'Choose your music folder',
      defaultPath: lib.getSavedDir(),
      properties: ['openDirectory' as const],
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const dir = result.filePaths[0]
    if (result.canceled || !dir) return null
    lib.saveDir(dir)
    return dir
  })

  ipcMain.handle('local:scan', async (_e, dir?: string) => {
    const target = dir || lib.getSavedDir()
    lib.saveDir(target)
    try {
      return await lib.scan(target)
    } catch (err) {
      console.error('[local-music] scan failed:', err)
      throw err
    }
  })

  // ── Track metadata library ──────────────────────────────────────────────────
  // Tracks are addressed by their served id; the path is resolved from the last
  // scan's registry so these can't touch files outside the scanned folder.

  ipcMain.handle('local:meta:get', (_e, localId: string) => catalog.getMeta(localId))

  ipcMain.handle('local:meta:upsert', (_e, localId: string, meta: LocalTrackMeta) => {
    const filePath = lib.pathForId(localId)
    if (!filePath) throw new Error('unknown track id')
    return catalog.upsertMeta(localId, filePath, meta)
  })

  ipcMain.handle('local:meta:delete', (_e, localId: string) => {
    catalog.deleteMeta(localId)
  })

  ipcMain.handle('local:read-tags', async (_e, localId: string) => {
    const filePath = lib.pathForId(localId)
    if (!filePath) throw new Error('unknown track id')
    return catalog.readEmbeddedTags(filePath)
  })

  // ── Album / artist artwork ──────────────────────────────────────────────────
  ipcMain.handle('local:art:get', (_e, scope: ArtScope, key: string) => art.getArt(scope, key))

  ipcMain.handle('local:art:clear', (_e, scope: ArtScope, key: string) => { art.clearArt(scope, key) })

  // Opens the native image picker, stores the chosen image, and returns it as a
  // data URL. Returns null if the user cancels.
  ipcMain.handle('local:art:pick-set', async (_e, scope: ArtScope, key: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const opts = {
      title: scope === 'artist' ? 'Choose artist image' : 'Choose album cover',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    return art.setArtFromFile(scope, key, file)
  })

  // ── Favorites (artists / albums / songs) ─────────────────────────────────────
  ipcMain.handle('local:fav:list', () => favorites.listFavorites())
  ipcMain.handle('local:fav:toggle', (_e, kind: FavKind, ref: string) => favorites.toggleFavorite(kind, ref))

  // ── Playlists ────────────────────────────────────────────────────────────────
  ipcMain.handle('local:playlist:list', () => playlists.listPlaylists())
  ipcMain.handle('local:playlist:create', (_e, name: string) => playlists.createPlaylist(name))
  ipcMain.handle('local:playlist:rename', (_e, id: string, name: string) => { playlists.renamePlaylist(id, name) })
  ipcMain.handle('local:playlist:delete', (_e, id: string) => { playlists.deletePlaylist(id) })
  ipcMain.handle('local:playlist:add', (_e, id: string, localId: string) => { playlists.addToPlaylist(id, localId) })
  ipcMain.handle('local:playlist:remove', (_e, id: string, localId: string) => { playlists.removeFromPlaylist(id, localId) })
}
