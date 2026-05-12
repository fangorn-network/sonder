import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { OllamaManager, OllamaStatus } from "./ollama-manager";
import { LLMProvider } from "@fangorn-network/agent-types";

export type AgentProvider = LLMProvider | "none";

export interface AgentProviderConfig {
  provider: AgentProvider;
  ollamaBaseUrl?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  ollamaModel?: string;
  unloadModelsOnNone?: boolean;
  systemPrompt?: string;
}

export interface ProviderStatus {
  provider: AgentProvider;
  ready: boolean;
  ollamaStatus?: OllamaStatus;
  models?: string[];
  error?: string;
}

export class AgentProviderManager {
  private config: AgentProviderConfig | null = null;
  private ollamaManager: OllamaManager;
  private configPath: string;

  constructor() {
    this.ollamaManager = new OllamaManager();
    this.configPath = path.join(app.getPath("userData"), "agent-config.json");
  }

  /**
   * Load persisted config from disk. Returns null if the user has
   * never made a selection (i.e. first launch).
   */
  async loadConfig(): Promise<AgentProviderConfig | null> {
    try {
      const raw = await fs.readFile(this.configPath, "utf-8");
      this.config = JSON.parse(raw) as AgentProviderConfig;
      return this.config;
    } catch {
      return null;
    }
  }

  /**
   * Save the chosen provider config to disk.
   */
  async saveConfig(config: AgentProviderConfig): Promise<void> {
    this.config = config;
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Clear stored config (reset to first-launch state).
   */
  async clearConfig(): Promise<void> {
    this.config = null;
    try {
      await fs.unlink(this.configPath);
    } catch {
      // file may not exist
    }
  }

  getConfig(): AgentProviderConfig | null {
    return this.config;
  }

  getOllamaManager(): OllamaManager {
    return this.ollamaManager;
  }

  /**
   * Attempt to initialise the configured provider. Call this at app
   * startup (after loadConfig) and after the user changes their selection.
   *
   * For Ollama: detects install → starts server → verifies readiness.
   * For Anthropic: validates that an API key is present (a lightweight
   *   /models call could be added for real key validation).
   * For none:   always succeeds.
   */
  async initialise(): Promise<ProviderStatus> {
    if (!this.config) {
      return {
        provider: "none",
        ready: false,
        error: "No provider configured. Please complete setup.",
      };
    }

    switch (this.config.provider) {
      case "ollama":
        return this.initialiseOllama();
      case "anthropic":
        return this.initialiseClaude();
    }

    return {provider: "none", ready: true}
  }

  // ── Ollama ──────────────────────────────────────────────────────────

  private async initialiseOllama(): Promise<ProviderStatus> {
    if (this.config?.ollamaBaseUrl) {
      this.ollamaManager = new OllamaManager(this.config.ollamaBaseUrl);
    }

    const status = await this.ollamaManager.start();

    if (!status.running) {
      return {
        provider: LLMProvider.Ollama,
        ready: false,
        ollamaStatus: status,
        error: status.error ?? "Ollama is not running.",
      };
    }

    const models = await this.ollamaManager.listModels();

    return {
      provider: LLMProvider.Ollama,
      ready: true,
      ollamaStatus: status,
      models,
    };
  }

  // ── Claude ──────────────────────────────────────────────────────────

  private async initialiseClaude(): Promise<ProviderStatus> {
    const apiKey = this.config?.claudeApiKey;

    if (!apiKey) {
      return {
        provider: LLMProvider.Anthropic,
        ready: false,
        error: "Claude API key is missing.",
      };
    }

    // Lightweight validation: hit the /v1/models endpoint.
    // If you prefer instant startup, you can skip this and
    // let errors surface on first agent call instead.
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 401) {
        return {
          provider: LLMProvider.Anthropic,
          ready: false,
          error: "Invalid Anthropic API key.",
        };
      }

      return { provider: LLMProvider.Anthropic, ready: true };
    } catch (err: any) {
      // Network errors shouldn't block startup — the key might be fine
      // but the user is offline. Mark as ready and let errors surface later.
      return { provider: LLMProvider.Anthropic, ready: true };
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  /**
   * Clean shutdown. Call from app.on("before-quit").
   */
  async shutdown(): Promise<void> {
    await this.ollamaManager.stop();
  }
}