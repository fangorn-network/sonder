import {FangornAgentApi} from "../preload"
import type {Sond3rBootApi} from "../preload/index.d"

// src/renderer/src/env.d.ts or global.d.ts
declare global {
  interface Window {
    api: {
      spotifyAuth: () => Promise<{ access_token: string; refresh_token: string; expires_in: number }>
      spotifyRefresh: (token: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string }>
    }
    agentAPI: FangornAgentApi;
    // SOND3R backend boot lifecycle — drives StartupView's progress bar.
    sond3r?: Sond3rBootApi;
  }
}