import { LLMProvider } from "@fangorn-network/agent-types"

export interface LLMModelUI {
  id: string
  desc: string
  label?: string
  sizes?: string[]
}

export type Provider = LLMProvider | 'none'

export const PROVIDERS: { key: Provider; label: string; desc: string }[] = [
  { key: LLMProvider.Ollama, label: 'Ollama', desc: 'Local inference — runs on your machine' },
  { key: LLMProvider.Anthropic, label: 'Claude', desc: 'Anthropic API — requires an API key' },
  { key: 'none', label: 'None', desc: 'Disable the agent entirely' },
]

export const OLLAMA_MODELS: LLMModelUI[] = [
  { id: 'qwen3.5', desc: 'Strong reasoning at small sizes', sizes: ['1.5b', '4b', '8b'] },
  { id: 'gemma3', desc: 'Google\'s efficient open model', sizes: ['1b', '4b', '12b'] },
  { id: 'llama3.1', desc: 'Meta\'s general-purpose model', sizes: ['8b', '70b'] },
  { id: 'phi4-mini', desc: 'Microsoft\'s compact reasoner', sizes: ['3.8b'] },
  { id: 'mistral', desc: 'Fast and capable 7B model', sizes: ['7b'] },
  { id: 'deepseek-r1', desc: 'Strong reasoning and math', sizes: ['1.5b', '7b', '8b', '14b'] },
  { id: 'qwen3', desc: 'Alibaba\'s versatile model', sizes: ['1.7b', '4b', '8b', '14b'] },
]

export const CLAUDE_MODELS: LLMModelUI[] = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', desc: 'Most capable — agentic coding, vision, self-verification' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', desc: '1M context, multi-agent collaboration' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Near-Opus quality at lower cost' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest and most affordable' },
]