import { ipcMain, shell } from "electron";
import { AgentProviderManager, AgentProviderConfig } from "./agent-provider-manager";
import { AgentBridge } from "./agent-bridge";
import { ToolboxConfigManager } from "./toolbox-config-manager";

/**
 * Register all agent-related IPC handlers.
 * Call once from your main process entry point.
 */
export function registerAgentIpcHandlers(
  manager: AgentProviderManager,
  bridge: AgentBridge,
  toolboxConfigManager: ToolboxConfigManager,
): void {

  // ── Provider setup ────────────────────────────────────────────────

  ipcMain.handle("agent:get-config", async () => {
    return manager.getConfig();
  });

  ipcMain.handle(
    "agent:set-provider",
    async (_event, config: AgentProviderConfig) => {
      await manager.saveConfig(config);
      const status = await manager.initialise();

      // Re-initialise the agent bridge with the new provider
      if (status.ready && config.provider !== "none") {
        try {
          await bridge.reinitialise();
        } catch (err: any) {
          return {
            ...status,
            ready: false,
            error: `Provider ready but agent failed to initialise: ${err.message}`,
          };
        }
      }

      return status;
    }
  );

  ipcMain.handle("agent:reset-config", async () => {
    bridge.reset();
    await manager.clearConfig();
    return { success: true };
  });

  ipcMain.handle("agent:get-status", async () => {
    return manager.initialise();
  });

  ipcMain.handle("agent:is-ready", () => {
    return bridge.isReady();
  });

  // ── Ollama-specific ───────────────────────────────────────────────

  ipcMain.handle("agent:ollama-status", async () => {
    return manager.getOllamaManager().getStatus();
  });

  ipcMain.handle("agent:ollama-install", async () => {
    await shell.openExternal("https://ollama.com/download");
    return { opened: true };
  });

  ipcMain.handle("agent:ollama-list-models", async () => {
    return manager.getOllamaManager().listModels();
  });

  ipcMain.handle("agent:ollama-pull-model", async (event, model: string) => {
    const ollama = manager.getOllamaManager();

    await ollama.pullModel(model, (progress) => {
      event.sender.send("agent:ollama-pull-progress", { model, ...progress });
    });

    return { success: true, model };
  });

  /**
   * Delete a local model.
   */
  ipcMain.handle("agent:ollama-delete-model", async (_event, model: string) => {
    const ollama = manager.getOllamaManager();
    try {
      await ollama.deleteModel(model);
      return { success: true, model };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Agent chat ────────────────────────────────────────────────────

  ipcMain.handle("agent:chat", async (_event, query: string) => {
    try {
      return { success: true, response: await bridge.fullAgenticChat(query) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    "agent:chat-scoped",
    async (_event, query: string, toolNames: string[]) => {
      try {
        return {
          success: true,
          response: await bridge.toolScopedAgenticChat(query, toolNames),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle("agent:find-similar", async (_event, data: any) => {
    try {
      return { success: true, response: await bridge.findSimilar(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:return-filters", async (_event, data: any) => {
    try {
      return { success: true, response: await bridge.returnFilters(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Agent introspection ───────────────────────────────────────────

  ipcMain.handle("agent:list-tools", () => {
    try {
      return { success: true, tools: bridge.getAllToolNames() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:list-toolboxes", () => {
    try {
      return { success: true, toolboxes: bridge.getToolBoxToolNamesMap() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:reset", () => {
    bridge.destroy();
    return { success: true };
  });

  // ── Toolbox config ──────────────────────────────────────────────

  /**
   * Get the toolbox registry (descriptors for all known toolboxes).
   */
  ipcMain.handle("agent:toolbox-registry", () => {
    return toolboxConfigManager.getRegistry();
  });

  /**
   * Get all saved toolbox configurations.
   */
  ipcMain.handle("agent:toolbox-config", async () => {
    return toolboxConfigManager.load();
  });

  /**
   * Update a single toolbox's config (enable/disable + fields).
   */
  ipcMain.handle("agent:toolbox-update", async (_event, entry) => {
    try {
      const config = await toolboxConfigManager.updateToolbox(entry);
      return { success: true, config };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:toolbox-enable", async (_event, id: string) => {
    try {
      await bridge.enableToolbox(id);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:toolbox-disable", async (_event, name: string) => {
    try {
      bridge.disableToolbox(name);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:change-provider", async (_event, provider: string, model: string, apiKey?: string, url?: string) => {
    try {
      await bridge.changeProvider(provider, model, apiKey, url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("agent:change-model", async (_event, model: string) => {
    try {
      await bridge.changeModel(model);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  
  ipcMain.handle("agent:ollama-stop", async () => {
    try {
      await manager.getOllamaManager().unloadAllModels();
      await manager.getOllamaManager().stop();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}