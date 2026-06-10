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
}
