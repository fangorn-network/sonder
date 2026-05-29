// types/profile.ts
// Renamed from kernel.ts — user-facing concept is a "profile", not a "kernel"

export interface KernelSnapshot {
  id:           string
  name:         string
  description?: string
  tags:         string[]
  queryVector:  number[]   // serialized Float32Array — the taste embedding
  entropy:      number
  genreWeights: Record<string, number>
  playCount:    number
  skipCount:    number
  createdAt:    number
  updatedAt:    number
}

const STORAGE_KEY = 'sond3r:kernels'

export function loadKernels(): KernelSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveKernels(profiles: KernelSnapshot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function upsertKernel(profile: KernelSnapshot): KernelSnapshot[] {
  const all = loadKernels()
  const idx = all.findIndex(p => p.id === profile.id)
  if (idx >= 0) all[idx] = profile
  else all.unshift(profile)
  saveKernels(all)
  return all
}

export function deleteKernel(id: string): KernelSnapshot[] {
  const all = loadKernels().filter(p => p.id !== id)
  saveKernels(all)
  return all
}

export function newKernelId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}