import { FangornAgent, FangornAgentResponse } from "@fangorn-network/agent";
import {
  FangornAgentConfig,
  FangornAgentToolConfig,
  DataContext,
  LLMProvider,
} from "@fangorn-network/agent-types";
import { AgentProviderManager } from "./agent-provider-manager";
import { ToolboxConfigManager, ToolboxConfigEntry } from "./toolbox-config-manager";

export class AgentBridge {
  private agent: FangornAgent | null = null;
  private providerManager: AgentProviderManager;
  private toolboxConfigManager: ToolboxConfigManager;
  private toolboxDir: string;
  private dataContextProvider: () => DataContext;
  private llmProvider = LLMProvider.Ollama;
  private llmModel = "qwen3.5:0.8b"

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
   * Build a FangornAgentToolConfig from the persisted toolbox configs.
   * Maps the UI-saved fields back into the shape the agent expects.
   */
  private buildToolConfig(): FangornAgentToolConfig {
    const cfg = this.toolboxConfigManager.getConfig();
    const entries = new Map<string, ToolboxConfigEntry>();

    if (cfg) {
      for (const entry of cfg.toolboxes) {
        entries.set(entry.id, entry);
      }
    }

    const get = (id: string): ToolboxConfigEntry =>
      entries.get(id) ?? { id, enabled: false, fields: {} };

    const fangorn = get("fangornToolbox");
    const mcp = get("mcpToolbox");
    const agent0 = get("agent0SdkToolbox");
    const gmail = get("gmailToolbox");
    const taste = get("tasteToolbox");

    return {
      gmailConfig: {
        enabled: gmail.enabled,
        gmailClientId: (gmail.fields.gmailClientId as string) ?? "",
        gmailClientSecret: (gmail.fields.gmailClientSecret as string) ?? "",
        gmailRefreshToken: (gmail.fields.gmailRefreshToken as string) ?? "",
        agentSignoff: (gmail.fields.agentSignoff as string) ?? "",
      },
      mcpServerConfig: {
        enabled: mcp.enabled,
        mcpServerUrls: (mcp.fields.mcpServerUrls as string[]) ?? [],
      },
      agent0SdkToolConfig: {
        enabled: agent0.enabled,
        pinataJwt: (agent0.fields.pinataJwt as string) ?? "",
        chainConfig: null, // app-provided
        key: ((agent0.fields.key as string) ?? "0x") as any,
      },
      fangornToolConfig: {
        enabled: fangorn.enabled,
        walletClient: null, // app-provided
        config: null, // app-provided
        usdcContractAddress: ((fangorn.fields.usdcContractAddress as string) ?? "0x") as any,
        usdcDomainName: (fangorn.fields.usdcDomainName as string) ?? "",
        facilitatorAddress: ((fangorn.fields.facilitatorAddress as string) ?? "0x") as any,
        resourceServerUrl: (fangorn.fields.resourceServerUrl as string) ?? "",
        domain: (fangorn.fields.domain as string) ?? "",
      },
      useTasteTools: taste.enabled,
    };
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

    // Set the toolbox directory so activateToolboxPlugins knows where to scan
    process.env.TOOLBOX_DIR = this.toolboxDir;

    const agentConfig: FangornAgentConfig = {
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      useMemory: true,
      fangornAgentToolConfig: this.buildToolConfig(),
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