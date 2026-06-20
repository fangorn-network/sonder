import { ElectronAPI } from '@electron-toolkit/preload'
import { FangornAgentApi, BugReportApi, LocalMusicApi } from '.';

// Sizes + install state for the opt-in catalog download disclosure / Settings.
export interface SnapshotInfo {
  installed: boolean
  /** Compressed .gz download size (X). */
  compressedBytes: number
  /** Unpacked snapshot size (Y) — exact if the manifest records it, else estimated. */
  uncompressedBytes: number
  /** Peak free disk needed to install (Z): the .gz and the unpacked snapshot
   *  briefly coexist during decompression. */
  requiredBytes: number
  /** Free disk on the userData volume at the time of the query. */
  freeBytes: number
  /** Current on-disk footprint when installed, else 0. */
  installedBytes: number
}

// SOND3R backend boot lifecycle — the catalog download is opt-in; the renderer's
// StartupView drives a progress bar / consent prompt off these events.
export interface Sond3rBootApi {
  onSnapshotProgress: (cb: (d: { received: number; total: number }) => void) => void
  onSnapshotStatus: (cb: (s: string) => void) => void
  onWarmupProgress: (cb: (d: { phase: string | null; pct: number | null; indexed: number; total: number }) => void) => void
  onBackendReady: (cb: () => void) => void
  /** Background HNSW index-build progress streamed after backend:ready until the
   *  optimizer settles (done:true). Drives the post-warmup indexing bar. */
  onIndexingProgress: (cb: (d: { indexed: number; total: number; pct: number | null; done: boolean }) => void) => void
  /** Catalog not installed — fires with the size disclosure so the renderer can
   *  prompt the user to opt into the (large) download. */
  onNeedsConsent: (cb: (info: SnapshotInfo) => void) => void
  onBackendError: (cb: (msg: string) => void) => void
  offBootEvents: () => void
  isBackendReady: () => Promise<boolean>
  /** Current catalog sizes + install state (for the Settings data panel). */
  getSnapshotInfo: () => Promise<SnapshotInfo>
  /** Begin the opt-in download/recover/warm install; progress via the boot events. */
  downloadSnapshot: () => Promise<{ ok: boolean; error?: string }>
  /** Delete the catalog, free the disk, and return to the not-installed state. */
  deleteSnapshot: () => Promise<{ ok: boolean; error?: string }>
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
    localMusic: LocalMusicApi;
  }
}