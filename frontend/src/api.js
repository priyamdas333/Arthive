// src/api.js — backend calls + last-feed caching.
// getNews retries while the free backend wakes, AND caches the last good
// result so the UI can show it instantly on the next cold start.

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const CACHE_PREFIX = 'arthive-cache-'   // one cache per window

// Read the last cached feed for a window (or null). Used to show something
// instantly while the backend wakes.
export function getCachedNews(window) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + window)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Fetch news for a window. Retries while the backend cold-starts (~50s),
// reporting status via onStatus ('waking' | 'ok' | 'error'). On success it
// caches the result so the next cold start can show it immediately.
export async function getNews(window, onStatus) {
  const maxAttempts = 6
  const perTryTimeout = 15000
  const waitBetween = 3000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), perTryTimeout)
      const res = await fetch(`${API}/api/news?window=${window}`, {
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()

      // cache the good result for next time (best-effort)
      try {
        localStorage.setItem(CACHE_PREFIX + window,
          JSON.stringify({ items: data.items || [], meta: data.meta || null,
                           cachedAt: Date.now() }))
      } catch { /* storage full or blocked — ignore */ }

      if (onStatus) onStatus('ok')
      return data
    } catch (e) {
      if (attempt < maxAttempts) {
        if (onStatus) onStatus('waking')
        await new Promise((r) => setTimeout(r, waitBetween))
      } else {
        if (onStatus) onStatus('error')
        throw e
      }
    }
  }
}

export async function recordVisit() {
  try {
    const res = await fetch(`${API}/api/visit`, { method: 'POST' })
    if (!res.ok) return null
    const data = await res.json()
    return data.visits
  } catch {
    return null
  }
}
