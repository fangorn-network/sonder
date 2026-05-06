import { FangornAgent, FangornAgentResponse } from "@fangorn-network/agent";
import {
  FangornAgentConfig,
  FangornAgentToolConfig,
  DataContext,
  LLMProvider,
} from "@fangorn-network/agent-types";
import { AgentProviderManager } from "./agent-provider-manager";

export class AgentBridge {
  agent: FangornAgent | null = null;
  private providerManager: AgentProviderManager;
  private toolConfig: FangornAgentToolConfig;
  private dataContextProvider: () => DataContext;
  private llmProvider = LLMProvider.Ollama;
  private llmModel = "gemma4:e4b"

  constructor(
    providerManager: AgentProviderManager,
    toolConfig: FangornAgentToolConfig,
    dataContextProvider: () => DataContext,
  ) {
    this.providerManager = providerManager;
    this.toolConfig = toolConfig;
    this.dataContextProvider = dataContextProvider;
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

      // Extract port from the OllamaManager's base URL
      const ollamaUrl = this.providerManager.getOllamaManager().getBaseUrl();
      try {
        const url = new URL(ollamaUrl);
        process.env.OLLAMA_PORT = url.port || "11434";
      } catch {
        process.env.OLLAMA_PORT = "11434";
      }

      // Use the configured default model, or let the agent fall back to its own default
      if (config.defaultModel) {
        process.env.MODEL = config.defaultModel;
      }
    } else if (config.provider === "claude") {

      if (config.claudeApiKey) {
        process.env.ANTHROPIC_API_KEY = config.claudeApiKey;
      }
    }

    const llmModel = this.llmModel
    const llmProvider = this.llmProvider

    const agentConfig: FangornAgentConfig = {
      llmProvider,
      llmModel,
      useMemory: true,
      fangornAgentToolConfig: this.toolConfig,
    };

    this.agent = await FangornAgent.create(agentConfig, this.dataContextProvider);
  }

  async warmupOllama(): Promise<void> {
  const config = this.providerManager.getConfig();
  if (config?.provider !== "ollama") return;

  const baseUrl = this.providerManager.getOllamaManager().getBaseUrl();

  try {
    await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.llmModel, prompt: "", keep_alive: "10m" }),
    });
    console.log(`[agent] Model ${this.llmModel} warmed up.`);
  } catch (err: any) {
    console.warn(`[agent] Model warmup failed: ${err.message}`);
  }
}

  /**
   * Re-initialise the agent after the user changes their provider.
   * Clears the old instance and builds a new one.
   */
  async reinitialise(): Promise<void> {
    this.agent?.reset();
    this.agent = null;
    await this.initialise();
  }

  isReady(): boolean {
    return this.agent !== null;
  }

  /**
   * Full agentic chat — the agent chooses its own tools.
   * WARNING: DO NOT USE THIS IF YOU AGENT STRUGGLES WITH MULTI
   * STEP REASONING OR IF THERE ARE RESOURCE CONSTRAINTS
   */
  async fullAgenticChat(query: string): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.fullAgenticChat(query);
  }

  /**
   * Scoped chat — the agent only has access to the specified tools.
   */
  async toolScopedAgenticChat(
    query: string,
    toolNames: string[],
  ): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.toolScopedAgenticChat(query, toolNames);
  }

  /**
   * Find similar data.
   */
  async findSimilar(data: any): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.findSimilar(data);
  }

  /**
   * Return filters based on taste data.
   */
  async returnFilters(data: any): Promise<FangornAgentResponse> {
    this.ensureReady();
    return this.agent!.returnFilters(data);
  }

  /**
   * Get all available tool names.
   */
  getAllToolNames(): string[] {
    this.ensureReady();
    return this.agent!.getAllToolNames();
  }

  /**
   * Get a map of toolbox names to their tool names.
   */
  getToolBoxToolNamesMap(): Record<string, string[]> {
    this.ensureReady();
    const map = this.agent!.getToolBoxToolNamesMap();
    // Convert Map to plain object for IPC serialisation
    return Object.fromEntries(map);
  }

  /**
   * Reset the agent state (clears toolbay etc).
   */
  reset(): void {
    this.agent?.reset();
  }

  private ensureReady(): asserts this is { agent: FangornAgent } {
    if (!this.agent) {
      throw new Error(
        "Agent is not initialised. The user may not have selected a provider, " +
        "or the selected provider failed to start.",
      );
    }
  }
}