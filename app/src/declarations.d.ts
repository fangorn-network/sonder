declare module '*.css' {}

import { FangornAgentApi } from "./preload";

// src/renderer/src/env.d.ts or global.d.ts
interface Window {
    api: {
        spotifyAuth: () => Promise<{ access_token: string; refresh_token: string; expires_in: number }>
        spotifyRefresh: (token: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string }>
    agentAPI: FangornAgentApi;
  }
}