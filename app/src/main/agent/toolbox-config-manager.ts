import { app } from "electron";
import path from "path";
import fs from "fs/promises";

/**
 * Describes a single toolbox's UI-editable configuration.
 * Each toolbox defines its own schema; this is the serialised
 * representation that lives on disk and flows through IPC.
 */
export interface ToolboxConfigEntry {
  /** Matches the toolbox directory / plugin name */
  id: string;
  enabled: boolean;
  /** Toolbox-specific config values (string fields, URLs, etc.) */
  fields: Record<string, string | string[] | boolean>;
}

/**
 * The full persisted toolbox config file shape.
 */
export interface ToolboxConfigFile {
  toolboxes: ToolboxConfigEntry[];
}

/**
 * Describes a field the UI should render for a given toolbox.
 */
export interface ToolboxFieldDescriptor {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "url-list" | "toggle";
  placeholder?: string;
  /** If true, the app provides this value automatically (e.g. walletClient) */
  appProvided?: boolean;
}

/**
 * Metadata the UI needs to render a toolbox config card.
 */
export interface ToolboxDescriptor {
  id: string;
  label: string;
  description: string;
  fields: ToolboxFieldDescriptor[];
}

/**
 * Registry of known toolboxes and their UI field descriptors.
 * Add new entries here when you create a new toolbox plugin.
 */
export const TOOLBOX_REGISTRY: ToolboxDescriptor[] = [
  {
    id: "fangornToolbox",
    label: "Fangorn (x402f)",
    description: "Purchase and decrypt files using x402 and x402f",
    fields: [
      { key: "usdcContractAddress", label: "USDC Contract Address", type: "text", placeholder: "0x..." },
      { key: "usdcDomainName", label: "USDC Domain Name", type: "text", placeholder: "e.g. USDC" },
      { key: "facilitatorAddress", label: "Facilitator Address", type: "text", placeholder: "0x..." },
      { key: "resourceServerUrl", label: "Resource Server URL", type: "url", placeholder: "https://..." },
      { key: "domain", label: "Domain", type: "text", placeholder: "e.g. fangorn.network" },
      { key: "walletClient", label: "Wallet Client", type: "text", appProvided: true },
      { key: "config", label: "Chain Config", type: "text", appProvided: true },
    ],
  },
  {
    id: "mcpToolbox",
    label: "MCP Servers",
    description: "Connect to external MCP servers for additional tools",
    fields: [
      { key: "mcpServerUrls", label: "Server URLs", type: "url-list", placeholder: "https://mcp.example.com/sse" },
    ],
  },
  {
    id: "agent0SdkToolbox",
    label: "Agent0 SDK",
    description: "On-chain agent operations via Agent0",
    fields: [
      { key: "pinataJwt", label: "Pinata JWT", type: "password", placeholder: "eyJ..." },
      { key: "key", label: "Private Key", type: "password", placeholder: "0x..." },
      { key: "chainConfig", label: "Chain Config", type: "text", appProvided: true },
    ],
  },
  {
    id: "gmailToolbox",
    label: "Gmail",
    description: "Send and manage emails through Gmail",
    fields: [
      { key: "gmailClientId", label: "Client ID", type: "text", placeholder: "xxx.apps.googleusercontent.com" },
      { key: "gmailClientSecret", label: "Client Secret", type: "password" },
      { key: "gmailRefreshToken", label: "Refresh Token", type: "password" },
      { key: "agentSignoff", label: "Email Sign-off", type: "text", placeholder: "e.g. Best regards, Agent" },
    ],
  },
  {
    id: "tasteToolbox",
    label: "Taste Tools",
    description: "Music taste analysis and recommendation tools",
    fields: [],
  },
];

export class ToolboxConfigManager {
  private configPath: string;
  private config: ToolboxConfigFile | null = null;

  constructor() {
    this.configPath = path.join(app.getPath("userData"), "toolbox-config.json");
  }

  async load(): Promise<ToolboxConfigFile> {
    try {
      const raw = await fs.readFile(this.configPath, "utf-8");
      this.config = JSON.parse(raw) as ToolboxConfigFile;
    } catch {
      // First launch — create defaults with everything disabled
      this.config = {
        toolboxes: TOOLBOX_REGISTRY.map((desc) => ({
          id: desc.id,
          enabled: false,
          fields: {},
        })),
      };
    }
    return this.config;
  }

  async save(config: ToolboxConfigFile): Promise<void> {
    this.config = config;
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  async updateToolbox(entry: ToolboxConfigEntry): Promise<ToolboxConfigFile> {
    if (!this.config) await this.load();

    const idx = this.config!.toolboxes.findIndex((t) => t.id === entry.id);
    if (idx >= 0) {
      this.config!.toolboxes[idx] = entry;
    } else {
      this.config!.toolboxes.push(entry);
    }

    await this.save(this.config!);
    return this.config!;
  }

  getConfig(): ToolboxConfigFile | null {
    return this.config;
  }

  getRegistry(): ToolboxDescriptor[] {
    return TOOLBOX_REGISTRY;
  }
}