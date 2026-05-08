import { LLMProvider } from '@fangorn-network/agent-types'
import { useCallback, useEffect, useState } from 'react'
import "./AgentView.css"
import { AgentManager, AgentManagerState } from '../components/management/AgentManager'
import { ToolboxManager } from '../components/management/ToolboxManager'
import { CLAUDE_MODELS } from '../constants/models'

type Provider = LLMProvider | 'none'
type AgentTab = 'overview' | 'toolboxes'

interface ProviderStatus {
  provider: Provider
  ready: boolean
  ollamaStatus?: {
    installed: boolean
    running: boolean
    version?: string
    error?: string
  }
  models?: string[]
  error?: string
}

export function AgentView() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [toolboxes, setToolboxes] = useState<Record<string, string[]> | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AgentTab>('overview')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [status, config, toolboxResult, modelList] = await Promise.all([
        window.agentAPI.getStatus(),
        window.agentAPI.getConfig(),
        window.agentAPI.listToolboxes().catch(() => null),
        window.agentAPI.ollamaListModels().catch(() => []),
      ])
      setProviderStatus(status)
      setModels(modelList)

      if (config) {
        setSelectedModel(
          config.provider === LLMProvider.Anthropic
            ? (config.claudeModel ?? 'claude-sonnet-4-6')
            : (config.defaultModel ?? '')
        )
      }

      if (toolboxResult?.success && toolboxResult.toolboxes) {
        setToolboxes(toolboxResult.toolboxes)
      }
    } catch (err) {
      console.error('Failed to fetch agent info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleStateChange = useCallback((state: Partial<AgentManagerState>) => {
    if (state.providerStatus !== undefined) setProviderStatus(state.providerStatus)
    if (state.models !== undefined) setModels(state.models)
    if (state.selectedModel !== undefined) setSelectedModel(state.selectedModel)
  }, [])

  const currentProvider = providerStatus?.provider

  if (loading) {
    return (
      <div className="agent-view">
        <div className="agent-view-loading">
          <div className="agent-view-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="agent-view">
      <div className="agent-view-header">
        <div className="agent-view-header-left">
          <h2 className="agent-view-title">agent</h2>
          <nav className="agent-view-tabs">
            {(['overview', 'toolboxes'] as AgentTab[]).map((t) => (
              <button
                key={t}
                className={`agent-view-tab ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
        {tab === 'overview' && (
          <button className="agent-view-refresh" onClick={refresh}>refresh</button>
        )}
      </div>

      {providerStatus?.ready && currentProvider !== 'none' && (
        <section className="agent-card agent-card-wide">
          <h3 className="agent-card-label">status</h3>
          <div className="agent-status-grid">
            <div className="agent-status-item">
              <span className="agent-key">provider</span>
              <span className="agent-val">{currentProvider}</span>
            </div>
            <div className="agent-status-item">
              <span className="agent-key">connection</span>
              <span className="agent-dot on">connected</span>
            </div>
            <div className="agent-status-item">
              <span className="agent-key">model</span>
              <span className="agent-val">
                {currentProvider === LLMProvider.Anthropic
                  ? (CLAUDE_MODELS.find(m => m.id === selectedModel)?.label ?? selectedModel)
                  : (selectedModel || 'default')}
              </span>
            </div>
            {toolboxes && (
              <div className="agent-status-item">
                <span className="agent-key">tools</span>
                <span className="agent-val">
                  {Object.values(toolboxes).reduce((sum, t) => sum + t.length, 0)} across {Object.keys(toolboxes).length} toolboxes
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'overview' && (
        <AgentManager
          providerStatus={providerStatus}
          models={models}
          selectedModel={selectedModel}
          onStateChange={handleStateChange}
        />
      )}

      {tab === 'toolboxes' && <ToolboxManager />}
    </div>
  )
}