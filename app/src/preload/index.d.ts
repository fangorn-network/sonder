import { ElectronAPI } from '@electron-toolkit/preload'
import { FangornAgentApi, BugReportApi } from '.';

// SOND3R backend boot lifecycle — first run fetches + recovers the catalog
// snapshot; the renderer's StartupView drives a progress bar off these events.
export interface Sond3rBootApi {
  onSnapshotProgress: (cb: (d: { received: number; total: number }) => void) => void
  onSnapshotStatus: (cb: (s: string) => void) => void
  onWarmupProgress: (cb: (d: { phase: string | null; pct: number | null; indexed: number; total: number }) => void) => void
  onBackendReady: (cb: () => void) => void
  onBackendError: (cb: (msg: string) => void) => void
  offBootEvents: () => void
  isBackendReady: () => Promise<boolean>
  /** Re-tints the native window-controls overlay (min/max/close) to match the
   *  active light/dark theme. No-op on macOS. */
  setWindowTheme: (theme: 'light' | 'dark') => Promise<void>
  /** Wipes the renderer partition's storage (Privy session + cached app data)
   *  and reloads. Escape hatch for a wedged login; resolves just before reload. */
  resetSession: () => Promise<{ success: boolean }>
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
    bugReport?: BugReportApi;
  }
}