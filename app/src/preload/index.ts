import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgentProviderConfig, ProviderStatus } from "../main/agent/agent-provider-manager";
import type { OllamaStatus } from "../main/agent/ollama-manager";
import type { FangornAgentResponse } from "@fangorn-network/agent";

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
    // contextBridge.exposeInMainWorld('electron', electronAPI)
    // contextBridge.exposeInMainWorld('api', api)

    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', {
      spotifyApi: (args: any) => ipcRenderer.invoke('spotify:api', args)
    })

  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
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
