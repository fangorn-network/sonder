// hooks/useFangornAgent.ts
import { useState, useCallback } from "react";

const agentEnabled = import.meta.env.VITE_USE_AGENT ?? false;
const apiUrl = process.env.VITE_PUBLIC_AGENT_URL || "http://localhost:3001";

export function agentIsEnabled() {
  return agentEnabled;
}

export interface AgentMcpResult {
  resultType?: string;
  mcpResults?: unknown;
  agentMessage?: string;
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

    const toolNameList = [
      "get_files_by_file_fields",
      "get_file_by_file_field_value",
      "get_schema_by_name",
      "get_manifests_by_schema_name",
      "get_manifests_by_file_field_value",
      "get_files_by_manifest_state_id"
    ]

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, toolNameList }),
      });

      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const data = await res.json();
      const agentResponse = { mcpResults: data.mcpResults, agentMessage: data.response }
      console.log(`agentResponse: ${JSON.stringify(agentResponse, null, 2)}`)
      return agentResponse.mcpResults ? agentResponse : null
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