import { useCallback, useEffect, useState } from 'react'
import "./AgentView.css"

interface OllamaStatus {
  installed: boolean
  running: boolean
  version?: string
  error?: string
}

interface ProviderStatus {
  provider: 'ollama' | 'claude' | 'none'
  ready: boolean
  ollamaStatus?: OllamaStatus
  models?: string[]
  error?: string
}

export function AgentView() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [toolboxes, setToolboxes] = useState<Record<string, string[]> | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [status, toolboxResult, modelList] = await Promise.all([
        window.agentAPI.getStatus(),
        window.agentAPI.listToolboxes().catch(() => null),
        window.agentAPI.ollamaListModels().catch(() => []),
      ])
      setProviderStatus(status)
      if (toolboxResult?.success && toolboxResult.toolboxes) {
        setToolboxes(toolboxResult.toolboxes)
      }
      setModels(modelList)
    } catch (err) {
      console.error('Failed to fetch agent info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

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
        <h2 className="agent-view-title">agent</h2>
        <button className="agent-view-refresh" onClick={refresh}>refresh</button>
      </div>

      <div className="agent-view-grid">
        {/* Provider Status */}
        <section className="agent-card">
          <h3 className="agent-card-label">provider</h3>
          <div className="agent-card-body">
            <div className="agent-row">
              <span className="agent-key">type</span>
              <span className="agent-val">{providerStatus?.provider ?? '—'}</span>
            </div>
            <div className="agent-row">
              <span className="agent-key">status</span>
              <span className={`agent-dot ${providerStatus?.ready ? 'on' : 'off'}`}>
                {providerStatus?.ready ? 'connected' : 'disconnected'}
              </span>
            </div>
            {providerStatus?.error && (
              <div className="agent-row">
                <span className="agent-key">error</span>
                <span className="agent-val agent-err">{providerStatus.error}</span>
              </div>
            )}
          </div>
        </section>

        {/* Ollama Details */}
        {providerStatus?.provider === 'ollama' && providerStatus.ollamaStatus && (
          <section className="agent-card">
            <h3 className="agent-card-label">ollama</h3>
            <div className="agent-card-body">
              <div className="agent-row">
                <span className="agent-key">installed</span>
                <span className="agent-val">
                  {providerStatus.ollamaStatus.installed ? 'yes' : 'no'}
                </span>
              </div>
              <div className="agent-row">
                <span className="agent-key">running</span>
                <span className={`agent-dot ${providerStatus.ollamaStatus.running ? 'on' : 'off'}`}>
                  {providerStatus.ollamaStatus.running ? 'yes' : 'no'}
                </span>
              </div>
              {providerStatus.ollamaStatus.version && (
                <div className="agent-row">
                  <span className="agent-key">version</span>
                  <span className="agent-val">{providerStatus.ollamaStatus.version}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Models */}
        {models.length > 0 && (
          <section className="agent-card">
            <h3 className="agent-card-label">models</h3>
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