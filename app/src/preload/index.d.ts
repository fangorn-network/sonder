import { ElectronAPI } from '@electron-toolkit/preload'
import { FangornAgentApi } from '.';

// SOND3R backend boot lifecycle — first run fetches + recovers the catalog
// snapshot; the renderer's StartupView drives a progress bar off these events.
export interface Sond3rBootApi {
  onSnapshotProgress: (cb: (d: { received: number; total: number }) => void) => void
  onSnapshotStatus: (cb: (s: string) => void) => void
  onBackendReady: (cb: () => void) => void
  onBackendError: (cb: (msg: string) => void) => void
  offBootEvents: () => void
  isBackendReady: () => Promise<boolean>
}

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
    sond3r?: Sond3rBootApi;
  }
}