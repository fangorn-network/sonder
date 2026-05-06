import { useCallback, useEffect, useState } from 'react'

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

      <style>{agentViewStyles}</style>
    </div>
  )
}

const agentViewStyles = `
  .agent-view {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }

  .agent-view-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
  }

  .agent-view-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(163, 201, 168, 0.4);
    animation: agentViewPulse 1.4s ease-in-out infinite;
  }

  @keyframes agentViewPulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.5); }
  }

  .agent-view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
  }

  .agent-view-title {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 12px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: rgba(163, 201, 168, 0.5);
    font-weight: 400;
    margin: 0;
  }

  .agent-view-refresh {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(163, 201, 168, 0.4);
    background: none;
    border: 1px solid rgba(163, 201, 168, 0.12);
    border-radius: 3px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .agent-view-refresh:hover {
    color: rgba(163, 201, 168, 0.8);
    border-color: rgba(163, 201, 168, 0.3);
  }

  .agent-view-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 560px) {
    .agent-view-grid {
      grid-template-columns: 1fr;
    }
  }

  .agent-card {
    background: rgba(163, 201, 168, 0.03);
    border: 1px solid rgba(163, 201, 168, 0.08);
    border-radius: 4px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .agent-card-wide {
    grid-column: 1 / -1;
  }

  .agent-card-label {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(163, 201, 168, 0.35);
    margin: 0;
    font-weight: 400;
  }

  .agent-card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .agent-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .agent-key {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 11px;
    color: rgba(163, 201, 168, 0.4);
  }

  .agent-val {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 11px;
    color: rgba(163, 201, 168, 0.75);
    text-align: right;
  }

  .agent-err {
    color: rgba(232, 179, 179, 0.75);
  }

  .agent-dot {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .agent-dot::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-dot.on {
    color: rgba(163, 201, 168, 0.75);
  }

  .agent-dot.on::before {
    background: #5a9e5f;
    box-shadow: 0 0 6px rgba(90, 158, 95, 0.5);
  }

  .agent-dot.off {
    color: rgba(232, 179, 179, 0.6);
  }

  .agent-dot.off::before {
    background: rgba(232, 179, 179, 0.5);
  }

  .agent-model {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 11px;
    color: rgba(163, 201, 168, 0.65);
  }

  .agent-toolbox-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .agent-toolbox-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .agent-toolbox-name {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 11px;
    color: rgba(163, 201, 168, 0.55);
    font-weight: 500;
  }

  .agent-toolbox-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .agent-chip {
    font-family: "DM Mono", "Courier New", monospace;
    font-size: 10px;
    color: rgba(163, 201, 168, 0.5);
    background: rgba(163, 201, 168, 0.06);
    border: 1px solid rgba(163, 201, 168, 0.1);
    border-radius: 3px;
    padding: 3px 8px;
  }
`