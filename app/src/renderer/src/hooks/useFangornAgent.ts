// hooks/useFangornAgent.ts
import { useState, useCallback, useRef } from "react";

const agentEnabled = import.meta.env.VITE_USE_AGENT ?? false;
const apiUrl = import.meta.env.VITE_PUBLIC_AGENT_URL || "http://localhost:3001";

export function agentIsEnabled() {
  return agentEnabled;
}

export interface AgentMcpResult {
  resultType?: string;
  mcpResults?: unknown;
  agentMessage?: string;
}

interface QueueEntry {
  message: string;
  resolve: (result: AgentMcpResult | null) => void;
  reject: (err: unknown) => void;
}

export function useFangornAgent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queue of pending jobs and a flag to prevent concurrent draining
  const queue = useRef<QueueEntry[]>([]);
  const draining = useRef(false);

  const toolNameList = ["search_datasources"];

  const drainQueue = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    setLoading(true);

    while (queue.current.length > 0) {
      const entry = queue.current.shift()!;
      try {
        const res = await fetch(`${apiUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: entry.message, toolNameList }),
        });

        if (!res.ok) throw new Error(`Agent returned ${res.status}`);

        const data = await res.json();

        // Wait for 'done' status if the endpoint streams job state
        if (data.status && data.status !== "done") {
          throw new Error(`Unexpected job status: ${data.status}`);
        }

        const result: AgentMcpResult = {
          mcpResults: data.mcpResults,
          agentMessage: data.response,
        };

        console.log(`agentResponse: ${JSON.stringify(result, null, 2)}`);
        entry.resolve(result.mcpResults ? result : null);
        setError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Agent request failed";
        console.error("Agent error:", err);
        setError(msg);
        entry.resolve(null);
      }
    }

    draining.current = false;
    setLoading(false);
  }, []);

  const sendMessage = useCallback(
    (message: string): Promise<AgentMcpResult | null> => {
      if (!agentEnabled) {
        console.warn("Agent is not enabled");
        return Promise.resolve(null);
      }

      return new Promise<AgentMcpResult | null>((resolve, reject) => {
        queue.current.push({ message, resolve, reject });
        drainQueue();
      });
    },
    [drainQueue]
  );

  return { loading, error, sendMessage };
}