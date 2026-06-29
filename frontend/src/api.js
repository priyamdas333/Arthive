// src/api.js — all backend calls live here, in one place.
// WHY a separate file: components shouldn't know URLs or fetch details. They
// just call getNews() / recordVisit(). If the API changes, you edit one file.

// The API base URL comes from an environment variable so the same code works
// locally (localhost:8000) and in production (your Render URL) without edits.
// Vite exposes vars prefixed with VITE_ via import.meta.env.
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Fetch news for a time window ('4h' | '3d' | '7d').
// Returns { window, meta, items } — or throws, which the caller handles.
export async function getNews(window) {
  const res = await fetch(`${API}/api/news?window=${window}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// Record one visit and get the new total. Fire-and-forget on the frontend;
// if it fails we just don't show a count, never break the page.
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