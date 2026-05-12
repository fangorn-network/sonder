import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { existsSync, readdirSync, readFileSync } from "fs";
import { ToolboxDescriptor, ToolboxEntry } from "@fangorn-network/agent-types";

/**
 * The full persisted toolbox config file shape.
 */
export interface ToolboxConfigFile {
  toolboxes: ToolboxEntry[];
}

export class ToolboxConfigManager {
  private configPath: string;
  private config: ToolboxConfigFile | null = null;
  private registry: ToolboxDescriptor[] = [];
  private toolboxDir: string | null = null;

  constructor() {
    this.configPath = path.join(app.getPath("userData"), "toolbox-config.json");
  }

  /**
   * Scan the toolbox directory for config.json files and build
   * the registry of available toolboxes.
   */
  discoverRegistry(toolboxDir: string): ToolboxDescriptor[] {
    this.toolboxDir = toolboxDir;
    this.registry = [];

    if (!existsSync(toolboxDir)) {
      console.warn(`[toolbox-config] Directory not found: ${toolboxDir}`);
      return this.registry;
    }

    for (const entry of readdirSync(toolboxDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const configPath = path.join(toolboxDir, entry.name, "config.json");
      if (!existsSync(configPath)) {
        console.warn(`[toolbox-config] No config.json in ${entry.name}, skipping`);
        continue;
      }

      try {
        const raw = readFileSync(configPath, "utf-8");
        const descriptor = JSON.parse(raw) as ToolboxDescriptor;

        // Ensure the id matches the directory name
        if (descriptor.id !== entry.name) {
          console.warn(
            `[toolbox-config] config.json id "${descriptor.id}" doesn't match directory "${entry.name}", using directory name`
          );
          descriptor.id = entry.name;
        }

        this.registry.push(descriptor);
        console.log(`[toolbox-config] Discovered: ${descriptor.label} (${entry.name})`);
      } catch (err: any) {
        console.error(`[toolbox-config] Failed to parse config.json in ${entry.name}:`, err.message);
      }
    }

    return this.registry;
  }

  /**
   * Load persisted config from disk. Merges with the discovered
   * registry so new toolboxes get default entries and removed
   * toolboxes are cleaned up.
   */
  async load(): Promise<ToolboxConfigFile> {
    let persisted: ToolboxEntry[] = [];

    try {
      const raw = await fs.readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as ToolboxConfigFile;
      persisted = parsed.toolboxes ?? [];
    } catch {
      // First launch or corrupt file — start fresh
    }

    // Build a map of persisted entries
    const persistedMap = new Map(persisted.map((e) => [e.id, e]));

    // Merge: use persisted values where they exist, create defaults for new toolboxes
    const merged: ToolboxEntry[] = this.registry.map((desc) => {
      const existing = persistedMap.get(desc.id);
      if (existing) return existing;

      return {
        id: desc.id,
        enabled: false,
        fields: {},
      };
    });

    this.config = { toolboxes: merged };

    // Persist the merged result so new toolboxes appear in the file
    await this.save(this.config);

    return this.config;
  }

  async save(config: ToolboxConfigFile): Promise<void> {
    this.config = config;
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  async updateToolbox(entry: ToolboxEntry): Promise<ToolboxConfigFile> {
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
    return this.registry;
  }
}