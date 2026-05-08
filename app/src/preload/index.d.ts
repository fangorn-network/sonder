import { ElectronAPI } from '@electron-toolkit/preload'
import { FangornAgentApi } from '.';

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
        spotifyApi: (options: {
            url: string
            method: string
            token: string
            body?: any
        }) => Promise<{ status: number; body: string }>
    }
    agentAPI: FangornAgentApi;
  }
}