// hooks/useFangornAgent.ts
import { useState, useCallback } from "react";

export interface ChatEntry {
	id: number;
	role: "user" | "claude" | "system" | "mcp-result";
	message?: string;
	displayMessage?: string;
	resultType?: "schemas" | "schema_entries" | "manifest_states" | "manifests" | "files" | "fields";
	data?: unknown;
	/** Short label shown above contextual messages, e.g. "Re: fangorn.music.v1" */
	contextLabel?: string;
	/** Entity type for color-coding the context border */
	contextType?: "schema" | "manifest" | "file" | "field";
}

export interface SendOptions {
	silent?: boolean;
	contextLabel?: string;
	displayMessage?: string;
	contextType?: "schema" | "manifest" | "file";
	dataContext?: string;
}

interface AgentState {
	loading: boolean;
	error: string | null;
	chatHistory: ChatEntry[];
}

const agentEnabled = import.meta.env.VITE_USE_AGENT ?? false
const apiUrl = process.env.VITE_PUBLIC_AGENT_URL || "http://localhost:3001";

let entryId = 0;

export function agentIsEnabled() {
	return agentEnabled
}

export function useFangornAgent() {

	const [state, setState] = useState<AgentState>({
		loading: false,
		error: null,
		chatHistory: [],
	});

	const sendMessage = useCallback(async (message: string, options?: SendOptions) => {
		if (agentEnabled) {
			const silent = options?.silent ?? false;
			const contextLabel = options?.contextLabel;
			const contextType = options?.contextType;
			const displayMessage = options?.displayMessage;
			const dataContext = options?.dataContext;

			if (!silent) {
				const userEntry: ChatEntry = {
					id: ++entryId,
					role: "user",
					message,
					displayMessage: displayMessage,
					contextLabel,
					contextType,
				};

				setState((prev) => ({
					...prev,
					loading: true,
					error: null,
					chatHistory: [...prev.chatHistory, userEntry],
				}));
			} else {
				setState((prev) => ({ ...prev, loading: true, error: null }));
			}
			try {
				const res = await fetch(`${apiUrl}/chat`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message,
						dataContext
					}),
				});

				if (!res.ok) throw new Error(`Agent returned ${res.status}`);
				const data = await res.json();

				const newEntries: ChatEntry[] = [];

				// Add the LLM's text response if present
				if (data.response) {
					newEntries.push({
						id: ++entryId,
						role: "claude",
						message: data.response,
						contextLabel,
						contextType,
					});
				}

				// Add the MCP result if present
				if (data.mcpResults) {
					const result = data.mcpResults;
					newEntries.push({
						id: ++entryId,
						role: "mcp-result",
						resultType: result.resultType,
						data: result.data,
						contextLabel,
						contextType,
					});
				}

				setState((prev) => ({
					loading: false,
					error: null,
					chatHistory: [...prev.chatHistory, ...newEntries],
				}));
			} catch (err: unknown) {
				console.error(`Error encountered when sending agent a message ${err}`)
				setState((prev) => ({
					...prev,
					loading: false,
					error: "Unable to reach the Fangorn Agent. Make sure it is running.",
				}));
			}
		} else {
			console.warn("Agent is not enabled, but sendMessage was called")
			return
		}

	}, []);

	return { ...state, sendMessage };
}