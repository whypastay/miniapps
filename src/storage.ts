import { getWebApp, inTelegram } from './telegram.ts'

export type RecordPlace = 'cloud' | 'device' | 'memory'

export function placeLabel(place: RecordPlace): string {
  if (place === 'cloud') return 'TELEGRAM CLOUD'
  if (place === 'device') return 'THIS DEVICE'
  return 'THIS SESSION'
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('storage'))
      },
    )
  })
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function cloudGet(key: string): Promise<string | null> {
  const cloud = getWebApp()?.CloudStorage
  if (!cloud || typeof cloud.getItem !== 'function') return Promise.reject(new Error('no cloud'))
  return new Promise((resolve, reject) => {
    try {
      cloud.getItem(key, (error, value) => {
        if (error) reject(new Error(String(error)))
        else resolve(value ?? null)
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('cloud'))
    }
  })
}

function cloudSet(key: string, value: string): Promise<void> {
  const cloud = getWebApp()?.CloudStorage
  if (!cloud || typeof cloud.setItem !== 'function') return Promise.reject(new Error('no cloud'))
  return new Promise((resolve, reject) => {
    try {
      cloud.setItem(key, value, (error) => {
        if (error) reject(new Error(String(error)))
        else resolve()
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('cloud'))
    }
  })
}

export async function loadRecord(key: string): Promise<{ raw: string | null; place: RecordPlace }> {
  const local = readLocal(key)
  if (!inTelegram()) return { raw: local, place: local ? 'device' : 'memory' }
  try {
    const cloud = await withTimeout(cloudGet(key), 1200)
    if (cloud) {
      writeLocal(key, cloud)
      return { raw: cloud, place: 'cloud' }
    }
    if (local) {
      try { await withTimeout(cloudSet(key, local), 1200) } catch { /* keep the device copy */ }
      return { raw: local, place: 'device' }
    }
    return { raw: null, place: 'cloud' }
  } catch {
    return { raw: local, place: local ? 'device' : 'memory' }
  }
}

export async function saveRecord(key: string, raw: string): Promise<RecordPlace> {
  const stored = writeLocal(key, raw)
  if (!inTelegram()) return stored ? 'device' : 'memory'
  try {
    await withTimeout(cloudSet(key, raw), 1200)
    return 'cloud'
  } catch {
    return stored ? 'device' : 'memory'
  }
}

export function readJson<T>(key: string, revive: (value: unknown) => T | null): T | null {
  const raw = readLocal(key)
  if (!raw) return null
  try {
    return revive(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): boolean {
  return writeLocal(key, JSON.stringify(value))
}
