import { LLMProvider } from '@fangorn-network/agent-types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OLLAMA_MODELS, CLAUDE_MODELS, PROVIDERS, Provider } from '../../constants/models'

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

export interface AgentManagerState {
  providerStatus: ProviderStatus | null
  models: string[]
  selectedModel: string
}

interface AgentManagerProps {
  providerStatus: ProviderStatus | null
  models: string[]
  selectedModel: string
  onStateChange: (state: Partial<AgentManagerState>) => void
}

export function AgentManager({ providerStatus, models, selectedModel, onStateChange }: AgentManagerProps) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(providerStatus?.provider ?? null)
  const [claudeKey, setClaudeKey] = useState('')
  const [localModel, setLocalModel] = useState(selectedModel)
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const [pullTarget, setPullTarget] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [customModelName, setCustomModelName] = useState('')

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [stopOllama, setStopOllama] = useState(false)

  const unsubPullRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setSelectedProvider(providerStatus?.provider ?? null)
  }, [providerStatus?.provider])

  useEffect(() => {
    setLocalModel(selectedModel)
  }, [selectedModel])

  useEffect(() => {
    const init = async () => {
      const [config, ollStatus] = await Promise.all([
        window.agentAPI.getConfig(),
        window.agentAPI.ollamaStatus().catch(() => null),
      ])
      if (config) {
        setClaudeKey(config.claudeApiKey ?? '')
        setLocalModel(
          config.provider === LLMProvider.Anthropic
            ? (config.claudeModel ?? 'claude-sonnet-4-6')
            : (config.defaultModel ?? 'qwen3.5:4b')
        )
      }
      setOllamaStatus(ollStatus)
    }
    init()
  }, [])

  useEffect(() => {
    return () => { unsubPullRef.current?.() }
  }, [])

  const currentProvider = providerStatus?.provider
  const isPulling = pullTarget !== null

  const handleProviderSelect = (p: Provider) => {
    setSelectedProvider(p)
    if (p === LLMProvider.Anthropic) setLocalModel('claude-sonnet-4-6')
    else if (p === LLMProvider.Ollama) setLocalModel(selectedModel || 'qwen3.5:4b')
    else setLocalModel('')
    setDirty(true)
    setSaveError(null)
  }

  const handleSave = useCallback(async () => {
    if (!selectedProvider) return

    setSaving(true)
    setSaveError(null)

    try {
      const config: AgentConfig = { provider: selectedProvider }

      if (selectedProvider === LLMProvider.Anthropic) {
        if (!claudeKey.trim()) {
          setSaveError('API key is required for Claude.')
          setSaving(false)
          return
        }
        config.claudeApiKey = claudeKey.trim()
        config.claudeModel = localModel
      } else if (selectedProvider === LLMProvider.Ollama && localModel) {
        config.defaultModel = localModel
      }

      const status = await window.agentAPI.setProvider(config)

      if (selectedProvider === 'none') {
        await window.agentAPI.reset()
        if (stopOllama) {
          await window.agentAPI.ollamaStop()
        }
      }

      onStateChange({ providerStatus: status })

      if (!status.ready && status.error) {
        setSaveError(status.error)
      } else {
        const isReady = await window.agentAPI.isReady()
        if (isReady) {
          const providerChanged = currentProvider !== selectedProvider
          if (providerChanged) {
            await window.agentAPI.changeProvider(selectedProvider, localModel, claudeKey || undefined)
          } else if (localModel) {
            await window.agentAPI.changeModel(localModel)
          }
        }

        setDirty(false)
        onStateChange({ selectedModel: localModel })
        const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
        onStateChange({ models: modelList })
      }
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }, [selectedProvider, claudeKey, localModel, currentProvider, stopOllama, onStateChange])

  const handleInstallOllama = useCallback(async () => {
    await window.agentAPI.ollamaInstall()
  }, [])

  const handlePullModel = useCallback(async (modelName: string) => {
    if (pullTarget) return

    setPullTarget(modelName)
    setPullProgress(null)
    setPullError(null)

    unsubPullRef.current?.()
    unsubPullRef.current = window.agentAPI.onPullProgress((data) => {
      setPullProgress({ status: data.status, completed: data.completed, total: data.total })
    })

    try {
      await window.agentAPI.ollamaPullModel(modelName)
      const modelList = await window.agentAPI.ollamaListModels().catch(() => [])
      onStateChange({ models: modelList })
    } catch (err: any) {
      setPullError(err.message ?? `Failed to pull ${modelName}`)
    } finally {
      unsubPullRef.current?.()
      unsubPullRef.current = null
      setPullTarget(null)
      setPullProgress(null)
    }
  }, [pullTarget, onStateChange])

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
      onStateChange({ models: modelList })
      if (localModel === model) {
        setLocalModel('')
        setDirty(true)
      }
    } catch (err: any) {
      console.error('Failed to delete model:', err)
    }
  }, [localModel, onStateChange])

  const isModelPulled = (baseName: string): boolean => {
    return models.some((m) => m.startsWith(baseName))
  }

  const getModelFullName = (base: string, size: string): string => {
    return `${base}:${size}`
  }

  return (
    <div className="agent-view-grid">
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

        {selectedProvider === LLMProvider.Ollama && (
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
                  <span className="agent-key">Ollama status</span>
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
                        value={localModel}
                        onChange={(e) => { setLocalModel(e.target.value); setDirty(true) }}
                      >
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

        {selectedProvider === LLMProvider.Anthropic && (
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
                    className={`agent-claude-model-btn ${localModel === id ? 'selected' : ''}`}
                    onClick={() => { setLocalModel(id); setDirty(true) }}
                  >
                    <span className="agent-claude-model-name">{label ?? id}</span>
                    <span className="agent-claude-model-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedProvider === 'none' && (
          <div className="agent-provider-config">
            <label className="agent-checkbox-row">
              <input
                type="checkbox"
                checked={stopOllama}
                onChange={(e) => { setStopOllama(e.target.checked); setDirty(true) }}
              />
              <span className="agent-key">Unload all models from memory</span>
            </label>
          </div>
        )}

        {saveError && <div className="agent-save-error">{saveError}</div>}
        {dirty && (
          <button className="agent-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'saving...' : 'apply'}
          </button>
        )}
      </section>

      {currentProvider === LLMProvider.Ollama && models.length > 0 && selectedProvider === LLMProvider.Ollama && (
        <section className="agent-card agent-card-wide">
          <h3 className="agent-card-label">installed models</h3>
          <div className="agent-card-body">
            {models.map((model) => (
              <div className="agent-row" key={model}>
                <span className="agent-model">{model}</span>
                {deleteConfirm === model ? (
                  <div className="agent-delete-confirm">
                    <button className="agent-link-btn agent-delete-yes" onClick={() => handleDeleteModel(model)}>confirm</button>
                    <button className="agent-link-btn" onClick={() => setDeleteConfirm(null)}>cancel</button>
                  </div>
                ) : (
                  <button className="agent-link-btn agent-delete-btn" onClick={() => setDeleteConfirm(model)}>remove</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedProvider === LLMProvider.Ollama && ollamaStatus?.running && (
        <section className="agent-card agent-card-wide">
          <h3 className="agent-card-label">discover models</h3>

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

          <div className="agent-curated-list">
            {OLLAMA_MODELS.map(({ id, desc, sizes }) => {
              const pulled = isModelPulled(id)
              return (
                <div className="agent-curated-item" key={id}>
                  <div className="agent-curated-header">
                    <div className="agent-curated-info">
                      <span className="agent-curated-name">{id}</span>
                      {pulled && <span className="agent-curated-badge">installed</span>}
                    </div>
                    <span className="agent-curated-desc">{desc}</span>
                  </div>
                  <div className="agent-curated-sizes">
                    {sizes?.map((size) => {
                      const fullName = getModelFullName(id, size)
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
    </div>
  )
}