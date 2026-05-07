import { FangornAgent, FangornAgentResponse } from "@fangorn-network/agent";
import {
  FangornAgentConfig,
  DataContext,
  LLMProvider,
  AgenticConfig,
} from "@fangorn-network/agent-types";
import { AgentProviderManager } from "./agent-provider-manager";
import { ToolboxConfigManager } from "./toolbox-config-manager";

export class AgentBridge {
  private agent: FangornAgent | null = null;
  private providerManager: AgentProviderManager;
  private toolboxConfigManager: ToolboxConfigManager;
  private toolboxDir: string;
  private dataContextProvider: () => DataContext;
  private llmProvider = LLMProvider.Ollama;
  private llmModel = "qwen3.5:0.8b"
  private apiKey = ""

  constructor(
    providerManager: AgentProviderManager,
    toolboxConfigManager: ToolboxConfigManager,
    toolboxDir: string,
    dataContextProvider: () => DataContext,
  ) {
    this.providerManager = providerManager;
    this.toolboxConfigManager = toolboxConfigManager;
    this.toolboxDir = toolboxDir;
    this.dataContextProvider = dataContextProvider;
  }

  /**
   * Get the toolbox entries from persisted config.
   */
  private getToolboxEntries(): { id: string; enabled: boolean; fields: Record<string, any> }[] {
    const cfg = this.toolboxConfigManager.getConfig();
    return cfg?.toolboxes ?? [];
  }

  /**
   * Configure process.env based on the user's provider choice,
   * then create the FangornAgent instance.
   */
  async initialise(): Promise<void> {
    const config = this.providerManager.getConfig();

    if (!config || config.provider === "none") {
      this.agent = null;
      return;
    }

    // Set env vars that @fangorn-network/agent reads
    if (config.provider === "ollama") {
      process.env.LLM = "ollama";

      const ollamaUrl = this.providerManager.getOllamaManager().getBaseUrl();
      try {
        const url = new URL(ollamaUrl);
        process.env.OLLAMA_PORT = url.port || "11434";
      } catch {
        process.env.OLLAMA_PORT = "11434";
      }

      if (config.defaultModel) {
        process.env.MODEL = config.defaultModel;
      }
    } else if (config.provider === "claude") {
      process.env.LLM = "anthropic";

      if (config.claudeApiKey) {
        process.env.ANTHROPIC_API_KEY = config.claudeApiKey;
      }

      if (config.claudeModel) {
        process.env.ANTHROPIC_MODEL = config.claudeModel;
      }
    }

    const agenticConfig: AgenticConfig = {
        llmModel: this.llmModel,
        llmProvider: this.llmProvider,
        apiKey: this.apiKey,
        url: "http://localhost:11434"
      }

    const agentConfig: FangornAgentConfig = {
      useMemory: true,
      agenticConfig,
      toolboxDir: this.toolboxDir,
      toolboxEntries: this.getToolboxEntries(),
    };

    this.agent = await FangornAgent.create(agentConfig, this.dataContextProvider);
  }

  /**
   * Re-initialise the agent after the user changes their provider
   * or toolbox config. Clears the old instance and builds a new one.
   */
  async reinitialise(): Promise<void> {
    this.agent?.reset();
    this.agent = null;
    await this.initialise();
  }

  isReady(): boolean {
    return this.agent !== null;
  }

  async fullAgenticChat(query: string): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.fullAgenticChat(query);
  }

  async toolScopedAgenticChat(
    query: string,
    toolNames: string[],
  ): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.toolScopedAgenticChat(query, toolNames);
  }

  async findSimilar(data: any): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.findSimilar(data);
  }

  async returnFilters(data: any): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.returnFilters(data);
  }

  getAllToolNames(): string[] {
    this.ensureReady();
    return this.agent!.getAllToolNames();
  }

  getToolBoxToolNamesMap(): Record<string, string[]> {
    this.ensureReady();
    const map = this.agent!.getToolBoxToolNamesMap();
    return Object.fromEntries(map);
  }

  async enableToolbox(id: string): Promise<void> {
  this.ensureReady();
  const entries = this.getToolboxEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Toolbox ${id} not found in config`);

  entry.enabled = true;
  await this.agent!.loadToolbox(entry);
}

disableToolbox(name: string): void {
  this.ensureReady();
  this.agent!.unloadToolbox(name);
}

  reset(): void {
    this.agent?.reset();
  }

  getToolboxDir(): string {
    return this.toolboxDir;
  }

  private ensureReady(): void {
    if (!this.agent) {
      throw new Error(
        "Agent is not initialised. The user may not have selected a provider, " +
        "or the selected provider failed to start.",
      );
    }
  }
}