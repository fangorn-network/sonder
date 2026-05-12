import { useCallback, useEffect, useState } from 'react'

interface ToolboxFieldDescriptor {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'url-list' | 'toggle'
  placeholder?: string
  appProvided?: boolean
}

interface ToolboxDescriptor {
  id: string
  label: string
  description: string
  fields: ToolboxFieldDescriptor[]
}

interface ToolboxConfigEntry {
  id: string
  enabled: boolean
  fields: Record<string, string | string[] | boolean>
}

export function ToolboxManager() {
  const [registry, setRegistry] = useState<ToolboxDescriptor[]>([])
  const [configs, setConfigs] = useState<Map<string, ToolboxConfigEntry>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reg, cfg] = await Promise.all([
        window.agentAPI.toolboxRegistry(),
        window.agentAPI.toolboxConfig(),
      ])
      setRegistry(reg)
      const map = new Map<string, ToolboxConfigEntry>()
      for (const entry of cfg.toolboxes) {
        map.set(entry.id, entry)
      }
      setConfigs(map)
    } catch (err) {
      console.error('Failed to load toolbox config:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const getConfig = (id: string): ToolboxConfigEntry => {
    return configs.get(id) ?? { id, enabled: false, fields: {} }
  }

  const updateLocal = (id: string, update: Partial<ToolboxConfigEntry>) => {
    const current = getConfig(id)
    const updated = { ...current, ...update }
    setConfigs((prev) => new Map(prev).set(id, updated))
    setDirty((prev) => new Set(prev).add(id))
  }

  const handleToggle = useCallback(async (id: string) => {
    const current = configs.get(id) ?? { id, enabled: false, fields: {} }
    const updated = { ...current, enabled: !current.enabled }
    setSaving(id)
    try {
      // Persist the config change
      const result = await window.agentAPI.toolboxUpdate(updated)
      if (result.success) {
        // Hot-swap on the running agent
        if (updated.enabled) {
          await window.agentAPI.toolboxEnable(id)
        } else {
          await window.agentAPI.toolboxDisable(id)
        }
        setConfigs((prev) => new Map(prev).set(id, updated))
        setDirty((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to toggle toolbox:', err)
    } finally {
      setSaving(null)
    }
  }, [configs])

  const handleFieldChange = (id: string, key: string, value: string | string[] | boolean) => {
    const current = getConfig(id)
    updateLocal(id, { fields: { ...current.fields, [key]: value } })
  }

  const handleSave = useCallback(async (id: string) => {
    const entry = configs.get(id) ?? { id, enabled: false, fields: {} }
    setSaving(id)
    try {
      const result = await window.agentAPI.toolboxUpdate(entry)
      if (result.success) {
        setDirty((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to save toolbox config:', err)
    } finally {
      setSaving(null)
    }
  }, [configs])

  const handleUrlListAdd = (id: string, key: string) => {
    const current = getConfig(id)
    const list = (current.fields[key] as string[] | undefined) ?? []
    handleFieldChange(id, key, [...list, ''])
  }

  const handleUrlListRemove = (id: string, key: string, index: number) => {
    const current = getConfig(id)
    const list = [...((current.fields[key] as string[] | undefined) ?? [])]
    list.splice(index, 1)
    handleFieldChange(id, key, list)
  }

  const handleUrlListChange = (id: string, key: string, index: number, value: string) => {
    const current = getConfig(id)
    const list = [...((current.fields[key] as string[] | undefined) ?? [])]
    list[index] = value
    handleFieldChange(id, key, list)
  }

  if (loading) {
    return (
      <div className="toolbox-loading">
        <div className="agent-view-pulse" />
      </div>
    )
  }

  return (
    <div className="toolbox-manager">
      {registry.map((desc) => {
        const config = getConfig(desc.id)
        const isExpanded = expandedId === desc.id
        const isDirty = dirty.has(desc.id)
        const isSaving = saving === desc.id
        const editableFields = desc.fields.filter((f) => !f.appProvided)

        return (
          <div className="toolbox-card" key={desc.id}>
            <div
              className="toolbox-card-header"
              onClick={() => setExpandedId(isExpanded ? null : desc.id)}
            >
              <div className="toolbox-card-info">
                <div className="toolbox-card-title-row">
                  <span className="toolbox-card-name">{desc.label}</span>
                  <span className={`agent-dot ${config.enabled ? 'on' : 'off'}`}>
                    {config.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <span className="toolbox-card-desc">{desc.description}</span>
              </div>
              <div className="toolbox-card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`toolbox-toggle ${config.enabled ? 'on' : ''}`}
                  onClick={() => handleToggle(desc.id)}
                  disabled={isSaving}
                  title={config.enabled ? 'Disable' : 'Enable'}
                >
                  <div className="toolbox-toggle-track">
                    <div className="toolbox-toggle-thumb" />
                  </div>
                </button>
              </div>
            </div>

            {isExpanded && editableFields.length > 0 && (
              <div className="toolbox-card-body">
                {editableFields.map((field) => (
                  <div className="toolbox-field" key={field.key}>
                    {field.type === 'url-list' ? (
                      <UrlListField
                        label={field.label}
                        placeholder={field.placeholder}
                        values={(config.fields[field.key] as string[] | undefined) ?? []}
                        onChange={(idx, val) => handleUrlListChange(desc.id, field.key, idx, val)}
                        onAdd={() => handleUrlListAdd(desc.id, field.key)}
                        onRemove={(idx) => handleUrlListRemove(desc.id, field.key, idx)}
                      />
                    ) : field.type === 'toggle' ? (
                      <div className="toolbox-field-row">
                        <span className="agent-key">{field.label}</span>
                        <button
                          className={`toolbox-toggle small ${config.fields[field.key] ? 'on' : ''}`}
                          onClick={() => handleFieldChange(desc.id, field.key, !config.fields[field.key])}
                        >
                          <div className="toolbox-toggle-track">
                            <div className="toolbox-toggle-thumb" />
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="toolbox-field-row">
                        <label className="agent-key" htmlFor={`${desc.id}-${field.key}`}>
                          {field.label}
                        </label>
                        <input
                          id={`${desc.id}-${field.key}`}
                          className="agent-input"
                          type={field.type === 'password' ? 'password' : 'text'}
                          value={(config.fields[field.key] as string) ?? ''}
                          onChange={(e) => handleFieldChange(desc.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {isDirty && (
                  <button
                    className="agent-save-btn"
                    onClick={() => handleSave(desc.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'saving...' : 'save'}
                  </button>
                )}
              </div>
            )}

            {isExpanded && editableFields.length === 0 && (
              <div className="toolbox-card-body">
                <span className="toolbox-no-config">No configuration needed — just toggle on or off.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface UrlListFieldProps {
  label: string
  placeholder?: string
  values: string[]
  onChange: (index: number, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

function UrlListField({ label, placeholder, values, onChange, onAdd, onRemove }: UrlListFieldProps) {
  return (
    <div className="toolbox-url-list">
      <div className="toolbox-url-list-header">
        <span className="agent-key">{label}</span>
        <button className="agent-link-btn" onClick={onAdd}>+ add</button>
      </div>
      {values.map((val, idx) => (
        <div className="toolbox-url-list-row" key={idx}>
          <input
            className="agent-input"
            type="url"
            value={val}
            onChange={(e) => onChange(idx, e.target.value)}
            placeholder={placeholder}
          />
          <button className="agent-link-btn agent-delete-yes" onClick={() => onRemove(idx)}>✕</button>
        </div>
      ))}
      {values.length === 0 && (
        <span className="toolbox-no-config">No URLs configured.</span>
      )}
    </div>
  )
}