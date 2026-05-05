import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  spotifyAuth: (): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }> => ipcRenderer.invoke('spotify:auth'),

  spotifyRefresh: (refreshToken: string): Promise<{
    access_token: string
    expires_in: number
    refresh_token?: string
  }> => ipcRenderer.invoke('spotify:refresh', refreshToken),

  spotifyApi: (args: { url: string; method?: string; token: string; body?: any }) =>
    ipcRenderer.invoke('spotify:api', args)
}

// console.log('*********************************')
// console.log(window.api) 
// console.log(window.api?.spotifyAuth)

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
