import { FangornAgent, FangornAgentResponse } from "@fangorn-network/agent";
import {
  FangornAgentConfig,
  DataContext,
  LLMProvider,
  AgenticConfig,
} from "@fangorn-network/agent-types";
import { AgentProviderManager } from "./agent-provider-manager";
import { ToolboxConfigManager } from "./toolbox-config-manager";
import { ToolboxEntry } from "@fangorn-network/agent-types";
import { DEFAULT_SYSTEM_PROMPT } from "../../renderer/src/constants/prompts"

export class AgentBridge {
  private agent: FangornAgent | null = null;
  private providerManager: AgentProviderManager;
  private toolboxConfigManager: ToolboxConfigManager;
  private toolboxDir: string;
  private dataContextProvider: () => DataContext;
  private llmProvider = LLMProvider.Ollama;
  private llmModel = ""
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
  private getToolboxEntries(): ToolboxEntry[] {
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

    this.llmProvider = config.provider

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
        this.llmModel= config.defaultModel;
      }
    } else if (config.provider === LLMProvider.Anthropic) {

      if (config.claudeApiKey) {
        this.apiKey = config.claudeApiKey;
      }

      if (config.claudeModel) {
        this.llmModel = config.claudeModel;
      }
    }

    const agenticConfig: AgenticConfig = {
        llmModel: this.llmModel,
        llmProvider: this.llmProvider,
        apiKey: this.apiKey,
        url: "http://localhost:11434"
      }

    const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

    const agentConfig: FangornAgentConfig = {
      useMemory: false,
      systemPrompt,
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

  setSystemPrompt(prompt: string): void {
  this.ensureReady();
  this.agent!.setSystemPrompt(prompt);
}
  
  async changeProvider(provider: string, model: string, apiKey?: string, url?: string): Promise<void> {
    this.ensureReady();
    this.agent!.changeProvider({ llmProvider: provider as any, llmModel: model, apiKey, url });
  }

  async changeModel(model: string): Promise<void> {
    this.ensureReady();
    const config = this.providerManager.getConfig();
    this.agent!.changeModel({
      llmProvider: this.llmProvider,
      llmModel: model,
      apiKey: config?.claudeApiKey,
    });
  }

  private ensureReady(): void {
    if (!this.agent) {
      throw new Error(
        "Agent is not initialised. The user may not have selected a provider, " +
        "or the selected provider failed to start.",
      );
    }
  }

  destroy(): void {
    this.agent?.reset();
    this.agent = null;
  }
}