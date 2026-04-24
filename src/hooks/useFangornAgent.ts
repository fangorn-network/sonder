// hooks/useFangornAgent.ts
import { useState, useCallback } from "react";

const agentEnabled = import.meta.env.VITE_USE_AGENT ?? false;
const apiUrl = process.env.VITE_PUBLIC_AGENT_URL || "http://localhost:3001";

export function agentIsEnabled() {
  return agentEnabled;
}

export interface AgentMcpResult {
  resultType?: string;
  data?: unknown;
}

export function useFangornAgent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string): Promise<AgentMcpResult | null> => {
    if (!agentEnabled) {
      console.warn("Agent is not enabled");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const data = await res.json();
      return data.mcpResults ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Agent request failed";
      console.error("Agent error:", err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, sendMessage };
}