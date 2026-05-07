import { useCallback, useEffect, useState } from 'react'
import "./AgentView.css"

type Provider = 'ollama' | 'claude' | 'none'

interface OllamaStatus {
  installed: boolean
  running: boolean
  version?: string
  error?: string
}

interface ProviderStatus {
  provider: Provider
  ready: boolean
  ollamaStatus?: OllamaStatus
  models?: string[]
  error?: string
}

interface AgentConfig {
  provider: Provider
  ollamaBaseUrl?: string
  claudeApiKey?: string
  defaultModel?: string
}

const PROVIDERS: { key: Provider; label: string; desc: string }[] = [
  { key: 'ollama', label: 'Ollama', desc: 'Local inference — runs on your machine' },
  { key: 'claude', label: 'Claude', desc: 'Anthropic API — requires an API key' },
  { key: 'none', label: 'None', desc: 'Disable the agent entirely' },
]

export function AgentView() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [toolboxes, setToolboxes] = useState<Record<string, string[]> | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // edit state
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [claudeKey, setClaudeKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

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

      // sync edit state with current config
      if (config) {
        setSelectedProvider(config.provider)
        setClaudeKey(config.claudeApiKey ?? '')
        setSelectedModel(config.defaultModel ?? '')
      } else {
        setSelectedProvider(null)
      }

      if (toolboxResult?.success && toolboxResult.toolboxes) {
        setToolboxes(toolboxResult.toolboxes)
      }

      // check ollama regardless of current provider
      const ollStatus = await window.agentAPI.ollamaStatus().catch(() => null)
      setOllamaStatus(ollStatus)

      setDirty(false)
      setSaveError(null)
    } catch (err) {
      console.error('Failed to fetch agent info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleProviderSelect = (p: Provider) => {
    setSelectedProvider(p)
    setDirty(true)
    setSaveError(null)
  }

  const handleSave = useCallback(async () => {
    if (!selectedProvider) return

    setSaving(true)
    setSaveError(null)

    try {
      const config: AgentConfig = { provider: selectedProvider }

      if (selectedProvider === 'claude') {
        if (!claudeKey.trim()) {
          setSaveError('API key is required for Claude.')
          setSaving(false)
          return
        }
        config.claudeApiKey = claudeKey.trim()
      }

      if (selectedProvider === 'ollama' && selectedModel) {
        config.defaultModel = selectedModel
      }

      const status = await window.agentAPI.setProvider(config)
      setProviderStatus(status)

      if (!status.ready && status.error) {
        setSaveError(status.error)
      } else {
        setDirty(false)
        // refresh models list in case provider changed
        const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
        setModels(modelList)
      }
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }, [selectedProvider, claudeKey, selectedModel])

  const handleInstallOllama = useCallback(async () => {
    await window.agentAPI.ollamaInstall()
  }, [])

  if (loading) {
    return (
      <div className="agent-view">
        <div className="agent-view-loading">
          <div className="agent-view-pulse" />
        </div>
      </div>
    )
  }

  const currentProvider = providerStatus?.provider

  return (
    <div className="agent-view">
      <div className="agent-view-header">
        <h2 className="agent-view-title">agent</h2>
        <button className="agent-view-refresh" onClick={refresh}>refresh</button>
      </div>

      <div className="agent-view-grid">
        {/* Provider Selection */}
        <section className="agent-card agent-card-wide">
          <h3 className="agent-card-label">provider</h3>
          <div className="agent-provider-options">
            {PROVIDERS.map(({ key, label, desc }) => {
              const active = selectedProvider === key
              const isCurrent = currentProvider === key
              return (
                <button
                  key={key}
                  className={`agent-provider-btn ${active ? 'selected' : ''}`}
                  onClick={() => handleProviderSelect(key)}
                >
                  <div className="agent-provider-btn-top">
                    <span className="agent-provider-name">{label}</span>
                    {isCurrent && providerStatus?.ready && (
                      <span className="agent-dot on" style={{ fontSize: '9px' }}>active</span>
                    )}
                  </div>
                  <span className="agent-provider-desc">{desc}</span>
                </button>
              )
            })}
          </div>

          {/* Ollama sub-options */}
          {selectedProvider === 'ollama' && (
            <div className="agent-provider-config">
              {ollamaStatus && !ollamaStatus.installed && (
                <div className="agent-provider-notice">
                  <span className="agent-val">Ollama is not installed.</span>
                  <button className="agent-link-btn" onClick={handleInstallOllama}>
                    download ollama
                  </button>
                </div>
              )}

              {ollamaStatus?.installed && (
                <>
                  <div className="agent-row">
                    <span className="agent-key">status</span>
                    <span className={`agent-dot ${ollamaStatus.running ? 'on' : 'off'}`}>
                      {ollamaStatus.running ? 'running' : 'stopped'}
                    </span>
                  </div>
                  {ollamaStatus.version && (
                    <div className="agent-row">
                      <span className="agent-key">version</span>
                      <span className="agent-val">{ollamaStatus.version}</span>
                    </div>
                  )}
                  {models.length > 0 && (
                    <div className="agent-model-select">
                      <span className="agent-key">model</span>
                      <select
                        className="agent-select"
                        value={selectedModel}
                        onChange={(e) => { setSelectedModel(e.target.value); setDirty(true) }}
                      >
                        <option value="">default</option>
                        {models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Claude sub-options */}
          {selectedProvider === 'claude' && (
            <div className="agent-provider-config">
              <div className="agent-input-group">
                <label className="agent-key" htmlFor="claude-key">api key</label>
                <input
                  id="claude-key"
                  type="password"
                  className="agent-input"
                  value={claudeKey}
                  onChange={(e) => { setClaudeKey(e.target.value); setDirty(true) }}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* Save / Error */}
          {saveError && (
            <div className="agent-save-error">{saveError}</div>
          )}

          {dirty && (
            <button
              className="agent-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'saving...' : 'apply'}
            </button>
          )}
        </section>

        {/* Status card — only show when a provider is active */}
        {providerStatus?.ready && currentProvider !== 'none' && (
          <section className="agent-card">
            <h3 className="agent-card-label">status</h3>
            <div className="agent-card-body">
              <div className="agent-row">
                <span className="agent-key">provider</span>
                <span className="agent-val">{currentProvider}</span>
              </div>
              <div className="agent-row">
                <span className="agent-key">connection</span>
                <span className="agent-dot on">connected</span>
              </div>
            </div>
          </section>
        )}

        {/* Models — only when ollama is active */}
        {currentProvider === 'ollama' && models.length > 0 && (
          <section className="agent-card">
            <h3 className="agent-card-label">available models</h3>
            <div className="agent-card-body">
              {models.map((model) => (
                <div className="agent-row" key={model}>
                  <span className="agent-model">{model}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Toolboxes */}
        {toolboxes && Object.keys(toolboxes).length > 0 && (
          <section className="agent-card agent-card-wide">
            <h3 className="agent-card-label">toolboxes</h3>
            <div className="agent-toolbox-list">
              {Object.entries(toolboxes).map(([boxName, tools]) => (
                <div className="agent-toolbox-item" key={boxName}>
                  <div className="agent-toolbox-name">{boxName}</div>
                  <div className="agent-toolbox-chips">
                    {tools.map((tool) => (
                      <span className="agent-chip" key={tool}>{tool}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}