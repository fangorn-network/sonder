// hooks/useFangornAgent.ts
import { useState, useCallback, useRef } from "react";

export interface AgentMcpResult {
  resultType?: string;
  mcpResults?: unknown;
  agentMessage?: string;
}

interface QueueEntry {
  message: string;
  toolNames?: string[];
  resolve: (result: AgentMcpResult | null) => void;
  reject: (err: unknown) => void;
}

export function useFangornAgent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queue = useRef<QueueEntry[]>([]);
  const draining = useRef(false);

  const defaultToolNames = ["search_datasources"];

  const drainQueue = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    setLoading(true);

    while (queue.current.length > 0) {
      const entry = queue.current.shift()!;
      try {
        const isReady = await window.agentAPI.isReady();
        if (!isReady) {
          throw new Error("Agent is not initialised. Configure a provider in the Agent tab.");
        }

        const toolNames = entry.toolNames ?? defaultToolNames;
        const result = toolNames.length > 0
          ? await window.agentAPI.chatScoped(entry.message, toolNames)
          : await window.agentAPI.chat(entry.message);

        if (!result.success) {
          throw new Error(result.error ?? "Agent request failed");
        }

        const agentResult: AgentMcpResult = {
          mcpResults: result.response?.mcpResults,
          agentMessage: result.response?.text,
        };

        entry.resolve(agentResult.mcpResults ? agentResult : null);
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
    (message: string, toolNames?: string[]): Promise<AgentMcpResult | null> => {
      return new Promise<AgentMcpResult | null>((resolve, reject) => {
        queue.current.push({ message, toolNames, resolve, reject });
        drainQueue();
      });
    },
    [drainQueue]
  );

  return { loading, error, sendMessage };
}