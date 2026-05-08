import { useCallback, useEffect, useRef, useState } from 'react'
import "./AgentView.css"
import { ToolboxManager } from '../components/ToolboxManager'
import '../components/ToolboxManager.css'

type Provider = 'ollama' | 'claude' | 'none'
type AgentTab = 'overview' | 'toolboxes'

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
  claudeModel?: string
  defaultModel?: string
}

const PROVIDERS: { key: Provider; label: string; desc: string }[] = [
  { key: 'ollama', label: 'Ollama', desc: 'Local inference — runs on your machine' },
  { key: 'claude', label: 'Claude', desc: 'Anthropic API — requires an API key' },
  { key: 'none', label: 'None', desc: 'Disable the agent entirely' },
]

interface CuratedModel {
  name: string
  desc: string
  sizes: string[]
}

const CURATED_MODELS: CuratedModel[] = [
  { name: 'qwen3.5', desc: 'Strong reasoning at small sizes', sizes: ['1.5b', '4b', '8b'] },
  { name: 'gemma3', desc: 'Google\'s efficient open model', sizes: ['1b', '4b', '12b'] },
  { name: 'llama3.1', desc: 'Meta\'s general-purpose model', sizes: ['8b', '70b'] },
  { name: 'phi4-mini', desc: 'Microsoft\'s compact reasoner', sizes: ['3.8b'] },
  { name: 'mistral', desc: 'Fast and capable 7B model', sizes: ['7b'] },
  { name: 'deepseek-r1', desc: 'Strong reasoning and math', sizes: ['1.5b', '7b', '8b', '14b'] },
  { name: 'qwen3', desc: 'Alibaba\'s versatile model', sizes: ['1.7b', '4b', '8b', '14b'] },
]

interface ClaudeModel {
  id: string
  label: string
  desc: string
}

const CLAUDE_MODELS: ClaudeModel[] = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', desc: 'Most capable — agentic coding, vision, self-verification' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', desc: '1M context, multi-agent collaboration' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Near-Opus quality at lower cost' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest and most affordable' },
]

export function AgentView() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [toolboxes, setToolboxes] = useState<Record<string, string[]> | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AgentTab>('overview')

  // edit state
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [claudeKey, setClaudeKey] = useState('')
  const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-6')
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // model pull state
  const [pullTarget, setPullTarget] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [customModelName, setCustomModelName] = useState('')

  // delete state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const unsubPullRef = useRef<(() => void) | null>(null)

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
        setSelectedProvider(config.provider)
        setClaudeKey(config.claudeApiKey ?? '')
        setClaudeModel(config.claudeModel ?? 'claude-sonnet-4-6')
        setSelectedModel(config.defaultModel ?? '')
      } else {
        setSelectedProvider(null)
      }

      if (toolboxResult?.success && toolboxResult.toolboxes) {
        setToolboxes(toolboxResult.toolboxes)
      }

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

  // clean up pull progress listener on unmount
  useEffect(() => {
    return () => { unsubPullRef.current?.() }
  }, [])

  const handleProviderSelect = (p: Provider) => {
    setSelectedProvider(p)
    setDirty(true)
    setSaveError(null)
  }

  const currentProvider = providerStatus?.provider
  const isPulling = pullTarget !== null

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
        config.claudeModel = claudeModel
      }

      if (selectedProvider === 'ollama' && selectedModel) {
        config.defaultModel = selectedModel
      }

      // Persist the config
      const status = await window.agentAPI.setProvider(config)
      setProviderStatus(status)

      if (!status.ready && status.error) {
        setSaveError(status.error)
      } else {
        // Hot-swap provider/model on the running agent
        const isReady = await window.agentAPI.isReady()
        if (isReady) {
          const providerChanged = currentProvider !== selectedProvider

          if (providerChanged) {
            const llmProvider = selectedProvider === 'claude' ? 'anthropic' : 'ollama'
            const model = selectedProvider === 'claude' ? claudeModel : (selectedModel || 'qwen3.5:4b')
            await window.agentAPI.changeProvider(llmProvider, model, claudeKey || undefined)
          } else {
            const model = selectedProvider === 'claude' ? claudeModel : selectedModel
            if (model) {
              await window.agentAPI.changeModel(model)
            }
          }
        }

        setDirty(false)
        const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
        setModels(modelList)
      }
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }, [selectedProvider, claudeKey, claudeModel, selectedModel, currentProvider])

  const handleInstallOllama = useCallback(async () => {
    await window.agentAPI.ollamaInstall()
  }, [])

  const handlePullModel = useCallback(async (modelName: string) => {
    if (pullTarget) return // already pulling

    setPullTarget(modelName)
    setPullProgress(null)
    setPullError(null)

    // subscribe to progress
    unsubPullRef.current?.()
    unsubPullRef.current = window.agentAPI.onPullProgress((data) => {
      setPullProgress({ status: data.status, completed: data.completed, total: data.total })
    })

    try {
      await window.agentAPI.ollamaPullModel(modelName)
      // refresh model list after successful pull
      const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
      setModels(modelList)
    } catch (err: any) {
      setPullError(err.message ?? `Failed to pull ${modelName}`)
    } finally {
      unsubPullRef.current?.()
      unsubPullRef.current = null
      setPullTarget(null)
      setPullProgress(null)
    }
  }, [pullTarget])

  const handlePullCustom = useCallback(() => {
    const name = customModelName.trim()
    if (!name) return
    setCustomModelName('')
    handlePullModel(name)
  }, [customModelName, handlePullModel])

  const handleDeleteModel = useCallback(async (model: string) => {
    setDeleteConfirm(null)
    try {
      await window.agentAPI.ollamaDeleteModel(model)
      const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
      setModels(modelList)
      // if the deleted model was selected, clear selection
      if (selectedModel === model) {
        setSelectedModel('')
        setDirty(true)
      }
    } catch (err: any) {
      console.error('Failed to delete model:', err)
    }
  }, [selectedModel])

  // helper: is a curated model (any size) already pulled?
  const isModelPulled = (baseName: string): boolean => {
    return models.some((m) => m.startsWith(baseName))
  }

  const getModelFullName = (base: string, size: string): string => {
    return `${base}:${size}`
  }

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
                {currentProvider === 'ollama'
                  ? (selectedModel || 'default')
                  : (claudeModel ? CLAUDE_MODELS.find(m => m.id === claudeModel)?.label ?? claudeModel : '—')}
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
                  type="text"
                  className="agent-input"
                  value={claudeKey}
                  onChange={(e) => { setClaudeKey(e.target.value); setDirty(true) }}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                />
              </div>
              <div className="agent-claude-models">
                <span className="agent-key">model</span>
                <div className="agent-claude-model-list">
                  {CLAUDE_MODELS.map(({ id, label, desc }) => (
                    <button
                      key={id}
                      className={`agent-claude-model-btn ${claudeModel === id ? 'selected' : ''}`}
                      onClick={() => { setClaudeModel(id); setDirty(true) }}
                    >
                      <span className="agent-claude-model-name">{label}</span>
                      <span className="agent-claude-model-desc">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {saveError && <div className="agent-save-error">{saveError}</div>}
          {dirty && (
            <button className="agent-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'saving...' : 'apply'}
            </button>
          )}
        </section>

        {/* Local Models */}
        {currentProvider === 'ollama' && models.length > 0 && selectedProvider === 'ollama' && (
          <section className="agent-card agent-card-wide">
            <h3 className="agent-card-label">installed models</h3>
            <div className="agent-card-body">
              {models.map((model) => (
                <div className="agent-row" key={model}>
                  <span className="agent-model">{model}</span>
                  {deleteConfirm === model ? (
                    <div className="agent-delete-confirm">
                      <button
                        className="agent-link-btn agent-delete-yes"
                        onClick={() => handleDeleteModel(model)}
                      >
                        confirm
                      </button>
                      <button
                        className="agent-link-btn"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="agent-link-btn agent-delete-btn"
                      onClick={() => setDeleteConfirm(model)}
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Model Discovery */}
        {selectedProvider === 'ollama' && ollamaStatus?.running && (
          <section className="agent-card agent-card-wide">
            <h3 className="agent-card-label">discover models</h3>

            {/* Pull progress bar */}
            {isPulling && (
              <div className="agent-pull-status">
                <div className="agent-pull-info">
                  <span className="agent-key">pulling {pullTarget}</span>
                  <span className="agent-val">{pullProgress?.status ?? 'starting...'}</span>
                </div>
                {pullProgress?.total && pullProgress.total > 0 && (
                  <div className="agent-pull-bar-track">
                    <div
                      className="agent-pull-bar-fill"
                      style={{ width: `${Math.round(((pullProgress.completed ?? 0) / pullProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {pullError && <div className="agent-save-error">{pullError}</div>}

            {/* Custom model name */}
            <div className="agent-input-group">
              <input
                className="agent-input"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePullCustom() }}
                placeholder="model name, e.g. llama3.1:8b"
                disabled={isPulling}
              />
              <button
                className="agent-save-btn"
                onClick={handlePullCustom}
                disabled={isPulling || !customModelName.trim()}
                style={{ alignSelf: 'auto' }}
              >
                pull
              </button>
            </div>

            {/* Curated list */}
            <div className="agent-curated-list">
              {CURATED_MODELS.map(({ name, desc, sizes }) => {
                const pulled = isModelPulled(name)
                return (
                  <div className="agent-curated-item" key={name}>
                    <div className="agent-curated-header">
                      <div className="agent-curated-info">
                        <span className="agent-curated-name">{name}</span>
                        {pulled && <span className="agent-curated-badge">installed</span>}
                      </div>
                      <span className="agent-curated-desc">{desc}</span>
                    </div>
                    <div className="agent-curated-sizes">
                      {sizes.map((size) => {
                        const fullName = getModelFullName(name, size)
                        const alreadyPulled = models.includes(fullName)
                        return (
                          <button
                            key={size}
                            className={`agent-size-btn ${alreadyPulled ? 'pulled' : ''}`}
                            onClick={() => !alreadyPulled && handlePullModel(fullName)}
                            disabled={isPulling || alreadyPulled}
                            title={alreadyPulled ? 'Already installed' : `Pull ${fullName}`}
                          >
                            {size}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
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
      )}

      {tab === 'toolboxes' && <ToolboxManager />}
    </div>
  )
}