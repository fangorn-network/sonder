import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgentProviderConfig, ProviderStatus } from "../main/agent/agent-provider-manager";
import type { OllamaStatus } from "../main/agent/ollama-manager";
import type { FangornAgentResponse } from "@fangorn-network/agent";
import type { LocalTrack } from "../main/local/types";

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
}

const localMusic: LocalMusicApi = {
  defaultDir: () => ipcRenderer.invoke('local:default-dir'),
  getDir: () => ipcRenderer.invoke('local:get-dir'),
  pickDir: () => ipcRenderer.invoke('local:pick-dir'),
  scan: (dir?: string) => ipcRenderer.invoke('local:scan', dir),
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
        ipcRenderer.removeAllListeners('backend:ready')
        ipcRenderer.removeAllListeners('backend:error')
      },

      isBackendReady: () => ipcRenderer.invoke('backend:is-ready'),
    })

    // ── Local on-disk music ──────────────────────────────────────────
    // Pick a folder, scan it, and play files in-app via <audio>. Standalone
    // from the catalog player — see main/local/* and LocalMusicProvider.
    contextBridge.exposeInMainWorld('localMusic', localMusic)

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
