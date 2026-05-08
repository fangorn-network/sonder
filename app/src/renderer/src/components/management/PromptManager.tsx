import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SYSTEM_PROMPT } from '../../constants/prompts'

export function PromptManager() {
  const [systemPrompt, setSystemPrompt] = useState('')
  const [savedPrompt, setSavedPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const config = await window.agentAPI.getConfig()
        const prompt = config?.systemPrompt || DEFAULT_SYSTEM_PROMPT
        setSystemPrompt(prompt)
        setSavedPrompt(prompt)
      } catch (err) {
        console.error('Failed to load system prompt:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const dirty = systemPrompt !== savedPrompt
  const isDefault = systemPrompt === DEFAULT_SYSTEM_PROMPT

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.agentAPI.setSystemPrompt(systemPrompt)
      setSavedPrompt(systemPrompt)
    } catch (err) {
      console.error('Failed to save system prompt:', err)
    } finally {
      setSaving(false)
    }
  }, [systemPrompt])

  const handleReset = useCallback(() => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
  }, [])

  if (loading) {
    return (
      <div className="prompt-loading">
        <div className="agent-view-pulse" />
      </div>
    )
  }

  return (
    <div className="prompt-manager">
      <section className="agent-card agent-card-wide">
        <div className="prompt-header">
          <h3 className="agent-card-label">system prompt</h3>
          {!isDefault && (
            <button className="agent-link-btn" onClick={handleReset}>
              reset to default
            </button>
          )}
        </div>
        <p className="prompt-desc">
          This prompt is sent at the start of every agent conversation, regardless of provider or model.
        </p>
        <textarea
          className="prompt-textarea"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant..."
          rows={16}
          spellCheck={false}
        />
        {dirty && (
          <button
            className="agent-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'saving...' : 'save'}
          </button>
        )}
      </section>
    </div>
  )
}