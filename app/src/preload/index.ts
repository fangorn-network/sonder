import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgentProviderConfig, ProviderStatus } from "../main/agent/agent-provider-manager";
import type { OllamaStatus } from "../main/agent/ollama-manager";
import type { FangornAgentResponse } from "@fangorn-network/agent";
import type {
  ArtCandidate, ArtQuery, ArtScope, ImportMode, ImportProgress, ImportSummary, LibraryRoots,
  LocalTrack, LocalTrackMeta, LocalTrackTags, OrganizeProgress, OrganizeReport,
} from "../main/local/types";
import type { StoredMeta } from "../main/local/catalog";
import type { StoredTags } from "../main/local/taxonomy";
import type { FavKind, Favorites } from "../main/local/favorites";
import type { LocalPlaylist } from "../main/local/playlists";

// ── Local on-disk music ────────────────────────────────────────────────
export interface LocalMusicApi {
  /** OS-standard music folder (~/Music, %USERPROFILE%\Music, …). */
  defaultDir(): Promise<string>
  /** Last folder the user picked, or the default if none. */
  getDir(): Promise<string>
  /** Native folder picker. Returns the chosen path, or null if cancelled. */
  pickDir(): Promise<string | null>
  /** Recursively scan `dir` (defaults to the saved/default dir) for audio files. */
  scan(dir?: string): Promise<LocalTrack[]>

  // ── Bulk import + library roots ────────────────────────────────────────
  /** Native folder picker for an import source; returns the path plus how many
   *  audio files it contains, or null if cancelled. */
  importPickSource(): Promise<{ path: string; audioCount: number } | null>
  /** Import `source` by copying into the library or referencing it in place. */
  importRun(source: string, mode: ImportMode): Promise<ImportSummary>
  /** Subscribe to copy-import progress; returns an unsubscribe function. */
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  /** The library's primary folder plus any referenced-in-place folders. */
  listRoots(): Promise<LibraryRoots>
  /** Remove a referenced-in-place folder. */
  removeRoot(path: string): Promise<void>
  /** Smart-label every Unlabeled track (tags + filename + folder, with merging).
   *  Returns a report of what was labeled / merged / left for review. */
  autoOrganize(): Promise<OrganizeReport>
  /** Subscribe to auto-organize progress; returns an unsubscribe function. */
  onOrganizeProgress(cb: (p: OrganizeProgress) => void): () => void

  // ── Metadata library ──────────────────────────────────────────────────
  /** Stored metadata for a track, or null if it hasn't been labeled. */
  getMeta(localId: string): Promise<StoredMeta | null>
  /** Insert/update a track's metadata (requires title + artist). */
  saveMeta(localId: string, meta: LocalTrackMeta): Promise<StoredMeta>
  /** Remove a track's metadata (returns it to Unlabeled). */
  deleteMeta(localId: string): Promise<void>
  /** Best-effort metadata read from the file's embedded tags (for prefill). */
  readTags(localId: string): Promise<LocalTrackMeta>

  // ── Semantic taxonomy tags (local-only; not published/embedded) ───────
  /** Stored taxonomy tags for a track, or null if none have been set. */
  getTrackTags(localId: string): Promise<StoredTags | null>
  /** Every track that carries taxonomy tags — for showing a "tagged" indicator. */
  listTrackTags(): Promise<StoredTags[]>
  /** Insert/update a track's taxonomy tags (genres/moods/themes/contexts). */
  saveTrackTags(localId: string, tags: LocalTrackTags): Promise<StoredTags>
  /** Remove a track's taxonomy tags. */
  deleteTrackTags(localId: string): Promise<void>

  // ── Catalog discoverability ───────────────────────────────────────────
  /** Local ids of labeled tracks that have a vector in the SOND3R catalog
   *  (the local Qdrant collection). Empty if the catalog isn't ready. */
  listDiscoverable(): Promise<string[]>

  // ── Album / artist artwork ────────────────────────────────────────────
  /** Normalized keys that already have stored art, grouped by scope — for
   *  flagging which artists/albums still need artwork. */
  listArtKeys(): Promise<{ artist: string[]; album: string[] }>
  /** Stored artwork for (scope, key) as a data URL, or null if none. */
  getArt(scope: ArtScope, key: string): Promise<string | null>
  /** Open the image picker and store the chosen image; returns its data URL,
   *  or null if cancelled. */
  pickArt(scope: ArtScope, key: string): Promise<string | null>
  /** Open the image picker WITHOUT storing; returns the chosen file path plus a
   *  data URL for preview, or null if cancelled. Pair with setArtFile to commit
   *  it once the artist/album key is final. */
  pickImage(scope: ArtScope): Promise<{ path: string; dataUrl: string } | null>
  /** Store a previously picked image (by path) as the artwork for (scope, key);
   *  returns its data URL. */
  setArtFile(scope: ArtScope, key: string, path: string): Promise<string | null>
  /** Search a third party (Deezer) for album covers / artist photos. Returns
   *  candidates with inline thumbnail data URLs and a full-res URL to commit. */
  searchArt(scope: ArtScope, query: ArtQuery): Promise<ArtCandidate[]>
  /** Download a third-party image (by URL) and store it as the artwork for
   *  (scope, key); returns its data URL. */
  setArtFromUrl(scope: ArtScope, key: string, url: string): Promise<string | null>
  /** Remove the stored artwork for (scope, key). */
  clearArt(scope: ArtScope, key: string): Promise<void>

  // ── Favorites (artists / albums / songs) ──────────────────────────────
  /** All favorited refs, grouped by kind. */
  listFavorites(): Promise<Favorites>
  /** Flip a favorite on/off; resolves to the new state (true = now favorited). */
  toggleFavorite(kind: FavKind, ref: string): Promise<boolean>

  // ── Playlists ─────────────────────────────────────────────────────────
  /** All playlists with their ordered track ids. */
  listPlaylists(): Promise<LocalPlaylist[]>
  /** Create a new (empty) playlist; returns it. */
  createPlaylist(name: string): Promise<LocalPlaylist>
  /** Rename a playlist. */
  renamePlaylist(id: string, name: string): Promise<void>
  /** Delete a playlist and its track membership. */
  deletePlaylist(id: string): Promise<void>
  /** Append a track to a playlist (no-op if already present). */
  addToPlaylist(id: string, localId: string): Promise<void>
  /** Remove a track from a playlist. */
  removeFromPlaylist(id: string, localId: string): Promise<void>
}

const localMusic: LocalMusicApi = {
  defaultDir: () => ipcRenderer.invoke('local:default-dir'),
  getDir: () => ipcRenderer.invoke('local:get-dir'),
  pickDir: () => ipcRenderer.invoke('local:pick-dir'),
  scan: (dir?: string) => ipcRenderer.invoke('local:scan', dir),
  importPickSource: () => ipcRenderer.invoke('local:import:pick-source'),
  importRun: (source, mode) => ipcRenderer.invoke('local:import:run', source, mode),
  onImportProgress: (cb) => {
    const handler = (_e: unknown, p: ImportProgress) => cb(p)
    ipcRenderer.on('local:import:progress', handler)
    return () => ipcRenderer.removeListener('local:import:progress', handler)
  },
  listRoots: () => ipcRenderer.invoke('local:roots:list'),
  removeRoot: (path) => ipcRenderer.invoke('local:roots:remove', path),
  autoOrganize: () => ipcRenderer.invoke('local:auto-organize'),
  onOrganizeProgress: (cb) => {
    const handler = (_e: unknown, p: OrganizeProgress) => cb(p)
    ipcRenderer.on('local:organize:progress', handler)
    return () => ipcRenderer.removeListener('local:organize:progress', handler)
  },
  getMeta: (localId) => ipcRenderer.invoke('local:meta:get', localId),
  saveMeta: (localId, meta) => ipcRenderer.invoke('local:meta:upsert', localId, meta),
  deleteMeta: (localId) => ipcRenderer.invoke('local:meta:delete', localId),
  readTags: (localId) => ipcRenderer.invoke('local:read-tags', localId),
  getTrackTags: (localId) => ipcRenderer.invoke('local:tags:get', localId),
  listTrackTags: () => ipcRenderer.invoke('local:tags:list'),
  saveTrackTags: (localId, tags) => ipcRenderer.invoke('local:tags:upsert', localId, tags),
  deleteTrackTags: (localId) => ipcRenderer.invoke('local:tags:delete', localId),
  listDiscoverable: () => ipcRenderer.invoke('local:discoverable:list'),
  listArtKeys: () => ipcRenderer.invoke('local:art:keys'),
  getArt: (scope, key) => ipcRenderer.invoke('local:art:get', scope, key),
  pickArt: (scope, key) => ipcRenderer.invoke('local:art:pick-set', scope, key),
  pickImage: (scope) => ipcRenderer.invoke('local:art:pick', scope),
  setArtFile: (scope, key, path) => ipcRenderer.invoke('local:art:set-file', scope, key, path),
  searchArt: (scope, query) => ipcRenderer.invoke('local:art:search', scope, query),
  setArtFromUrl: (scope, key, url) => ipcRenderer.invoke('local:art:set-url', scope, key, url),
  clearArt: (scope, key) => ipcRenderer.invoke('local:art:clear', scope, key),
  listFavorites: () => ipcRenderer.invoke('local:fav:list'),
  toggleFavorite: (kind, ref) => ipcRenderer.invoke('local:fav:toggle', kind, ref),
  listPlaylists: () => ipcRenderer.invoke('local:playlist:list'),
  createPlaylist: (name) => ipcRenderer.invoke('local:playlist:create', name),
  renamePlaylist: (id, name) => ipcRenderer.invoke('local:playlist:rename', id, name),
  deletePlaylist: (id) => ipcRenderer.invoke('local:playlist:delete', id),
  addToPlaylist: (id, localId) => ipcRenderer.invoke('local:playlist:add', id, localId),
  removeFromPlaylist: (id, localId) => ipcRenderer.invoke('local:playlist:remove', id, localId),
}

// ── In-app bug reporter ────────────────────────────────────────────────
export interface BugReportInput {
  description: string
  expected?: string
  email?: string
  userId?: string
}
export interface BugReportResult {
  ok: boolean
  /** How it was filed: silently via the proxy, or by opening the browser. */
  via?: 'api' | 'browser'
  /** Issue URL when filed via the proxy. */
  url?: string
  error?: string
}
export interface BugReportDiagnostics {
  appVersion: string
  platform: string
  arch: string
  os: string
  electron: string
  chrome: string
  node: string
}
export interface BugReportApi {
  submit(input: BugReportInput): Promise<BugReportResult>
  getDiagnostics(): Promise<BugReportDiagnostics>
}

const bugReport: BugReportApi = {
  submit: (input) => ipcRenderer.invoke('bug:submit', input),
  getDiagnostics: () => ipcRenderer.invoke('bug:diagnostics'),
}

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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', {
      spotifyApi: (args: any) => ipcRenderer.invoke('spotify:api', args)
    })

    // for handling external (i.e. Spotify) oauth 
    contextBridge.exposeInMainWorld('electronAPI', {
      // Opens a URL in the system browser (whitelisted in main)
      openExternal: (url: string) =>
        ipcRenderer.invoke('shell:open-external', url),

      // Registers a one-time callback for when Spotify redirects back
      onSpotifyCallback: (cb: (callbackUrl: string) => void) => {
        // Remove any stale listener first to avoid duplicates across re-renders
        ipcRenderer.removeAllListeners('spotify:callback')
        ipcRenderer.on('spotify:callback', (_event, url: string) => cb(url))
      },

      // Cleanup — called in the useEffect return
      offSpotifyCallback: () => {
        ipcRenderer.removeAllListeners('spotify:callback')
      },
    })

    // ── SOND3R backend boot lifecycle ────────────────────────────────
    // First run downloads + recovers the catalog snapshot; the renderer
    // shows a boot screen driven by these events and gates its first
    // query on 'backend:ready'.
    contextBridge.exposeInMainWorld('sond3r', {
      // one-time download progress: { received, total } in bytes
      onSnapshotProgress: (cb: (d: { received: number; total: number }) => void) => {
        ipcRenderer.removeAllListeners('snapshot:progress')
        ipcRenderer.on('snapshot:progress', (_e, d) => cb(d))
      },
      // coarse stage: 'downloading' | 'decompressing' | 'recovering'
      onSnapshotStatus: (cb: (s: string) => void) => {
        ipcRenderer.removeAllListeners('snapshot:status')
        ipcRenderer.on('snapshot:status', (_e, s: string) => cb(s))
      },
      // warmup progress: { phase, pct, indexed, total }. pct is a real fraction
      // (records scanned / total) during the lexical build, and null for the
      // tail steps that have no measurable sub-progress.
      onWarmupProgress: (cb: (d: { phase: string | null; pct: number | null; indexed: number; total: number }) => void) => {
        ipcRenderer.removeAllListeners('snapshot:warmup')
        ipcRenderer.on('snapshot:warmup', (_e, d) => cb(d))
      },
      // backend fully up: Qdrant + collection + query server all ready
      onBackendReady: (cb: () => void) => {
        ipcRenderer.removeAllListeners('backend:ready')
        ipcRenderer.on('backend:ready', () => cb())
      },
      // backend failed somewhere in the boot chain
      onBackendError: (cb: (msg: string) => void) => {
        ipcRenderer.removeAllListeners('backend:error')
        ipcRenderer.on('backend:error', (_e, msg: string) => cb(msg))
      },
      // cleanup for the useEffect return, mirrors your Spotify pattern
      offBootEvents: () => {
        ipcRenderer.removeAllListeners('snapshot:progress')
        ipcRenderer.removeAllListeners('snapshot:status')
        ipcRenderer.removeAllListeners('snapshot:warmup')
        ipcRenderer.removeAllListeners('backend:ready')
        ipcRenderer.removeAllListeners('backend:error')
      },

      // Re-tint the native window-controls overlay to match the light/dark
      // theme. No-op on macOS (handled in main).
      setWindowTheme: (theme: 'light' | 'dark') =>
        ipcRenderer.invoke('window:set-theme', theme),

      isBackendReady: () => ipcRenderer.invoke('backend:is-ready'),

      // Clears this device's storage for the renderer partition (Privy session
      // + cached app data) and reloads. Escape hatch for a wedged login.
      resetSession: () => ipcRenderer.invoke('session:reset'),
    })

    // ── Local on-disk music ──────────────────────────────────────────
    // Pick a folder, scan it, and play files in-app via <audio>. Standalone
    // from the catalog player — see main/local/* and LocalMusicProvider.
    contextBridge.exposeInMainWorld('localMusic', localMusic)

    // ── In-app bug reporter ──────────────────────────────────────────
    // Renderer collects a description; main attaches diagnostics + recent
    // logs and files a GitHub issue. See main/bug-report.ts.
    contextBridge.exposeInMainWorld('bugReport', bugReport)

  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.localMusic = localMusic
  // @ts-ignore (define in dts)
  window.bugReport = bugReport
}


interface AgentResult {
  success: boolean;
  response?: FangornAgentResponse;
  error?: string;
}

export interface FangornAgentApi {
  // ── Provider setup ──────────────────────────────────────────────
  getConfig(): Promise<AgentProviderConfig | null>;
  setProvider(config: AgentProviderConfig): Promise<ProviderStatus>;
  resetConfig(): Promise<{ success: boolean }>;
  getStatus(): Promise<ProviderStatus>;
  isReady(): Promise<boolean>;

  // ── Ollama-specific ─────────────────────────────────────────────
  ollamaStatus(): Promise<OllamaStatus>;
  ollamaInstall(): Promise<{ opened: boolean }>;
  ollamaListModels(): Promise<string[]>;
  ollamaPullModel(model: string): Promise<{ success: boolean; model: string }>;
  ollamaDeleteModel(model: string): Promise<{ success: boolean; model?: string; error?: string }>;
  onPullProgress(
    callback: (data: { model: string; status: string; completed?: number; total?: number }) => void
  ): () => void;
  ollamaLoadedModels(): Promise<string[]>
  ollamaStop(): Promise<{ success: boolean; error?: string }>;

  // ── Agent chat ────────────────────────────────────────────────────
  chat(query: string): Promise<AgentResult>;
  chatScoped(query: string, toolNames: string[]): Promise<AgentResult>;

  // ── Agent introspection ───────────────────────────────────────────
  listTools(): Promise<{ success: boolean; tools?: string[]; error?: string }>;
  listToolboxes(): Promise<{ success: boolean; toolboxes?: Record<string, string[]>; error?: string }>;
  reset(): Promise<{ success: boolean }>;

  // ── Toolbox config ────────────────────────────────────────────────
  toolboxRegistry(): Promise<any[]>;
  toolboxConfig(): Promise<{ toolboxes: any[] }>;
  toolboxUpdate(entry: { id: string; enabled: boolean; fields: Record<string, any> }): Promise<{ success: boolean; config?: any; error?: string }>;
  toolboxEnable(id: string): Promise<{ success: boolean; error?: string }>;
  toolboxDisable(name: string): Promise<{ success: boolean; error?: string }>;

  // ── Provider/model switching ──────────────────────────────────────
  changeProvider(provider: string, model: string, apiKey?: string, url?: string): Promise<{ success: boolean; error?: string }>;
  changeModel(model: string): Promise<{ success: boolean; error?: string }>;
  setSystemPrompt(prompt: string): Promise<{ success: boolean; error?: string }>;
}

export const agentAPI: FangornAgentApi = {
  // ── Provider setup ──────────────────────────────────────────────
  getConfig: (): Promise<AgentProviderConfig | null> =>
    ipcRenderer.invoke("agent:get-config"),

  setProvider: (config: AgentProviderConfig): Promise<ProviderStatus> =>
    ipcRenderer.invoke("agent:set-provider", config),

  resetConfig: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("agent:reset-config"),

  getStatus: (): Promise<ProviderStatus> =>
    ipcRenderer.invoke("agent:get-status"),

  isReady: (): Promise<boolean> =>
    ipcRenderer.invoke("agent:is-ready"),

  // ── Ollama-specific ─────────────────────────────────────────────
  ollamaStatus: (): Promise<OllamaStatus> =>
    ipcRenderer.invoke("agent:ollama-status"),

  ollamaInstall: (): Promise<{ opened: boolean }> =>
    ipcRenderer.invoke("agent:ollama-install"),

  ollamaListModels: (): Promise<string[]> =>
    ipcRenderer.invoke("agent:ollama-list-models"),

  ollamaPullModel: (model: string): Promise<{ success: boolean; model: string }> =>
    ipcRenderer.invoke("agent:ollama-pull-model", model),

  ollamaDeleteModel: (model: string): Promise<{ success: boolean; model?: string; error?: string }> =>
    ipcRenderer.invoke("agent:ollama-delete-model", model),

  onPullProgress: (
    callback: (data: { model: string; status: string; completed?: number; total?: number }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on("agent:ollama-pull-progress", handler);

    return () => {
      ipcRenderer.removeListener("agent:ollama-pull-progress", handler);
    };
  },

  // ── Agent chat ────────────────────────────────────────────────────
  chat: (query: string): Promise<AgentResult> =>
    ipcRenderer.invoke("agent:chat", query),

  chatScoped: (query: string, toolNames: string[]): Promise<AgentResult> =>
    ipcRenderer.invoke("agent:chat-scoped", query, toolNames),

  // ── Agent introspection ───────────────────────────────────────────
  listTools: (): Promise<{ success: boolean; tools?: string[]; error?: string }> =>
    ipcRenderer.invoke("agent:list-tools"),

  listToolboxes: (): Promise<{ success: boolean; toolboxes?: Record<string, string[]>; error?: string }> =>
    ipcRenderer.invoke("agent:list-toolboxes"),

  reset: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("agent:reset"),

  // ── Toolbox config ────────────────────────────────────────────────
  toolboxRegistry: (): Promise<any[]> =>
    ipcRenderer.invoke("agent:toolbox-registry"),

  toolboxConfig: (): Promise<{ toolboxes: any[] }> =>
    ipcRenderer.invoke("agent:toolbox-config"),

  toolboxUpdate: (entry: { id: string; enabled: boolean; fields: Record<string, any> }): Promise<{ success: boolean; config?: any; error?: string }> =>
    ipcRenderer.invoke("agent:toolbox-update", entry),

  toolboxEnable: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:toolbox-enable", id),

  toolboxDisable: (name: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:toolbox-disable", name),

  changeProvider: (provider: string, model: string, apiKey?: string, url?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:change-provider", provider, model, apiKey, url),

  changeModel: (model: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:change-model", model),

  ollamaStop: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:ollama-stop"),

  ollamaLoadedModels: (): Promise<string[]> =>
    ipcRenderer.invoke("agent:ollama-loaded-models"),

  setSystemPrompt: (prompt: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("agent:set-system-prompt", prompt),
};

// Expose to renderer
contextBridge.exposeInMainWorld("agentAPI", agentAPI);
