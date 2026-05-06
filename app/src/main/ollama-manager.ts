import { ChildProcess, spawn } from "child_process";
import path from "path";
import os from "os";

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  error?: string;
}

export class OllamaManager {
  private process: ChildProcess | null = null;
  private baseUrl: string;
  private managedByUs = false;

  constructor(baseUrl = "http://127.0.0.1:11434") {
    this.baseUrl = baseUrl;
  }

  /**
   * Resolve the Ollama binary path based on the current platform.
   * Checks common install locations, then falls back to bare command
   * name (relying on PATH).
   */
  private getBinaryPath(): string {
    const platform = process.platform;

    const candidates: string[] = [];

    if (platform === "darwin") {
      // Homebrew (Intel + Apple Silicon) and official .app install
      candidates.push(
        "/usr/local/bin/ollama",
        "/opt/homebrew/bin/ollama",
        "/usr/bin/ollama",
        path.join(
          os.homedir(),
          "Applications",
          "Ollama.app",
          "Contents",
          "Resources",
          "ollama"
        ),
        path.join(
          "/Applications",
          "Ollama.app",
          "Contents",
          "Resources",
          "ollama"
        )
      );
    } else if (platform === "win32") {
      const localAppData =
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      candidates.push(
        path.join(localAppData, "Programs", "Ollama", "ollama.exe"),
        path.join("C:", "Program Files", "Ollama", "ollama.exe"),
        "ollama.exe"
      );
    } else {
      // Linux — typical install paths
      candidates.push(
        "/usr/local/bin/ollama",
        "/usr/bin/ollama",
        path.join(os.homedir(), ".local", "bin", "ollama")
      );
    }

    // We test for existence synchronously since this runs at startup.
    const fs = require("fs") as typeof import("fs");
    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // not found or not executable — try next
      }
    }

    // Fallback: rely on PATH resolution
    return platform === "win32" ? "ollama.exe" : "ollama";
  }

  /**
   * Ping the Ollama HTTP API to see if a server is already responding.
   */
  async isRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(this.baseUrl, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Try to get the Ollama version from the running server.
   */
  async getVersion(): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        return data.version;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * Check whether Ollama is installed on this system.
   * Returns true if we can locate the binary.
   */
  isInstalled(): boolean {
    const binaryPath = this.getBinaryPath();
    // If getBinaryPath returned a bare name (fallback), try a quick `which` / `where`
    if (!path.isAbsolute(binaryPath)) {
      try {
        const { execSync } = require("child_process") as typeof import("child_process");
        const cmd = process.platform === "win32" ? "where" : "which";
        execSync(`${cmd} ${binaryPath}`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }
    return true; // We already validated with accessSync in getBinaryPath
  }

  /**
   * Full status check: is Ollama installed and/or running?
   */
  async getStatus(): Promise<OllamaStatus> {
    const installed = this.isInstalled();
    const running = await this.isRunning();
    const version = running ? await this.getVersion() : undefined;

    return { installed, running, version };
  }

  /**
   * Start the Ollama server as a background child process.
   * If it is already running (externally or by us), this is a no-op.
   */
  async start(): Promise<OllamaStatus> {
    // If already running, nothing to do
    if (await this.isRunning()) {
      const version = await this.getVersion();
      return { installed: true, running: true, version };
    }

    if (!this.isInstalled()) {
      return {
        installed: false,
        running: false,
        error: "Ollama is not installed on this system.",
      };
    }

    const binaryPath = this.getBinaryPath();

    return new Promise((resolve) => {
      try {
        this.process = spawn(binaryPath, ["serve"], {
          stdio: "ignore",
          detached: process.platform !== "win32", // detach on unix so it survives parent signals
          env: {
            ...process.env,
            OLLAMA_HOST: this.baseUrl, // respect configured host/port
          },
        });

        this.managedByUs = true;

        this.process.on("error", (err) => {
          this.process = null;
          this.managedByUs = false;
          resolve({
            installed: true,
            running: false,
            error: `Failed to start Ollama: ${err.message}`,
          });
        });

        // Give it a moment to bind the port, then verify
        this.waitForReady(15_000)
          .then(async () => {
            const version = await this.getVersion();
            resolve({ installed: true, running: true, version });
          })
          .catch((err) => {
            resolve({
              installed: true,
              running: false,
              error: `Ollama started but didn't become ready: ${err.message}`,
            });
          });
      } catch (err: any) {
        resolve({
          installed: true,
          running: false,
          error: `Failed to spawn Ollama: ${err.message}`,
        });
      }
    });
  }

  /**
   * Poll until the Ollama API responds or we time out.
   */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeoutMs) {
      if (await this.isRunning()) return;
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Ollama did not become ready within ${timeoutMs}ms`);
  }

  /**
   * List models currently available in the local Ollama instance.
   */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        models?: { name: string }[];
      };
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Pull a model, streaming progress through a callback.
   */
  async pullModel(
    model: string,
    onProgress?: (progress: { status: string; completed?: number; total?: number }) => void
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Failed to pull model ${model}: ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const progress = JSON.parse(line);
          onProgress?.(progress);
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  /**
   * Gracefully shut down the Ollama process *only* if we started it.
   * Never kills an externally-managed instance.
   */
  async stop(): Promise<void> {
    if (!this.process || !this.managedByUs) return;

    return new Promise((resolve) => {
      const proc = this.process!;

      proc.on("exit", () => {
        this.process = null;
        this.managedByUs = false;
        resolve();
      });

      // Give it a few seconds to shut down gracefully before forcing
      const forceKillTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // already dead
        }
      }, 5_000);

      proc.on("exit", () => clearTimeout(forceKillTimer));

      try {
        if (process.platform === "win32") {
          proc.kill(); // SIGTERM equivalent on Windows
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        this.process = null;
        this.managedByUs = false;
        resolve();
      }
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}