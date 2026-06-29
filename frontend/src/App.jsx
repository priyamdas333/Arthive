// src/App.jsx — the whole app.
// Kept as one file for learnability; you can split into components later.
//
// REACT IN ONE PARAGRAPH: a component is a function that returns UI (JSX).
// "state" is data that, when it changes, makes React re-run the function and
// update the screen. useState creates state. useEffect runs side-effects (like
// fetching) when the component mounts or when chosen values change. That's 90%
// of what's happening below.

import { useState, useEffect, useCallback } from 'react'
import { getNews, recordVisit } from './api.js'

// Map each category tag -> its color CSS variables, for the colored pills.
const TAG_STYLE = {
  results:    { fg: 'var(--green)',  bg: 'var(--green-bg)'  },
  order_win:  { fg: 'var(--purple)', bg: 'var(--purple-bg)' },
  mna:        { fg: 'var(--accent)', bg: 'var(--accent-bg)' },
  rating:     { fg: 'var(--amber)',  bg: 'var(--amber-bg)'  },
  capital:    { fg: 'var(--accent)', bg: 'var(--accent-bg)' },
  regulatory: { fg: 'var(--red)',    bg: 'var(--red-bg)'    },
  expansion:  { fg: 'var(--accent)', bg: 'var(--accent-bg)' },
  management: { fg: 'var(--amber)',  bg: 'var(--amber-bg)'  },
  general:    { fg: 'var(--text-2)', bg: 'var(--surface-2)' },
}
const TAG_LABEL = {
  results: 'results', order_win: 'order win', mna: 'M&A', rating: 'rating',
  capital: 'capital', regulatory: 'regulatory', expansion: 'expansion',
  management: 'management', general: 'news',
}

const WINDOWS = [
  { id: '4h', label: 'Last 4 hours' },
  { id: '3d', label: '3 days' },
  { id: '7d', label: '7 days' },
]
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'results', label: 'Results' },
  { id: 'order_win', label: 'Orders' },
  { id: 'mna', label: 'M&A' },
  { id: 'rating', label: 'Ratings' },
  { id: 'regulatory', label: 'Regulatory' },
]

// Convert a unix timestamp into "2h ago" style text.
function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function App() {
  // --- STATE: each useState returns [value, setter]. Changing a value
  // re-renders the component. ---
  const [theme, setTheme] = useState(() =>
    // read saved theme on first load; default dark (finance feel)
    localStorage.getItem('arthive-theme') || 'dark'
  )
  const [windowId, setWindowId] = useState('4h')   // selected time window
  const [category, setCategory] = useState('all')  // selected category filter
  const [items, setItems] = useState([])           // news items from the API
  const [meta, setMeta] = useState(null)           // {updated_at, counts, ...}
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [visits, setVisits] = useState(null)

  // watchlist: a Set of symbols the user starred, persisted in the browser.
  // (Personalization is the strongest repeat-visit lever.)
  const [watchlist, setWatchlist] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('arthive-watchlist') || '[]')) }
    catch { return new Set() }
  })
  const [onlyWatchlist, setOnlyWatchlist] = useState(false)

  // "new since last visit": remember the newest timestamp we showed last time.
  const [lastSeen] = useState(() =>
    Number(localStorage.getItem('arthive-lastseen') || 0)
  )

  // --- EFFECT: apply the theme to <html> and save it, whenever theme changes ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('arthive-theme', theme)
  }, [theme])

  // --- EFFECT: record one visit on first load only (empty [] = run once) ---
  useEffect(() => {
    recordVisit().then(setVisits)
  }, [])

  // --- DATA FETCH: a function we can call to (re)load news for a window. ---
  // useCallback memoizes it so the effect below doesn't re-create it each render.
  const load = useCallback(async (win) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getNews(win)
      setItems(data.items || [])
      setMeta(data.meta || null)
      // remember the newest item time so next visit can compute "new since"
      if (data.items && data.items.length) {
        localStorage.setItem('arthive-lastseen', String(data.items[0].ts))
      }
    } catch (e) {
      setError('Could not load news. Retrying shortly.')
    } finally {
      setLoading(false)
    }
  }, [])

  // --- EFFECT: load whenever the window changes; also auto-refresh every 3h. ---
  useEffect(() => {
    load(windowId)
    // auto-refresh keeps the feed fresh without a manual reload
    const id = setInterval(() => load(windowId), 3 * 60 * 60 * 1000)
    return () => clearInterval(id)   // cleanup when window changes/unmounts
  }, [windowId, load])

  // --- EVENT HANDLERS ---
  const toggleStar = (symbol) => {
    setWatchlist((prev) => {
      const next = new Set(prev)
      next.has(symbol) ? next.delete(symbol) : next.add(symbol)
      localStorage.setItem('arthive-watchlist', JSON.stringify([...next]))
      return next
    })
  }

  // --- DERIVED DATA: filter the items for display (no extra state needed) ---
  const visible = items.filter((it) => {
    if (onlyWatchlist && !watchlist.has(it.symbol)) return false
    if (category !== 'all' && it.category !== category) return false
    return true
  })
  const newCount = items.filter((it) => it.ts > lastSeen).length

  return (
    <div style={{ maxWidth: 660, margin: '0 auto', padding: '24px 16px 64px' }}>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        meta={meta}
      />

      {/* time-window + watchlist row */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <Pill key={w.id} on={windowId === w.id} onClick={() => setWindowId(w.id)}>
            {w.label}
          </Pill>
        ))}
        <span style={{ flex: 1 }} />
        <Pill on={onlyWatchlist} onClick={() => setOnlyWatchlist(!onlyWatchlist)}>
          ★ My watchlist{watchlist.size ? ` (${watchlist.size})` : ''}
        </Pill>
      </div>

      {/* category row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <Pill key={c.id} small on={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </Pill>
        ))}
      </div>

      {/* "new since last visit" hook */}
      {newCount > 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
            {newCount} new since your last visit
          </span>
        </div>
      )}

      {/* the feed */}
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <Empty text={error} />
      ) : visible.length === 0 ? (
        <Empty text={onlyWatchlist ? 'No news for your watchlist in this window.' : 'No news in this window yet.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {visible.map((it, i) => (
            <NewsCard
              key={it.url + i}
              item={it}
              starred={watchlist.has(it.symbol)}
              isNew={it.ts > lastSeen}
              onStar={() => toggleStar(it.symbol)}
            />
          ))}
        </div>
      )}

      <Footer visits={visits} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SMALL COMPONENTS — each is just a function returning JSX.
// ---------------------------------------------------------------------------
function Header({ theme, onToggleTheme, meta }) {
  const updated = meta?.updated_at ? timeAgo(meta.updated_at) : null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Arthive</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {updated && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)' }}>
              <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} />
              updated {updated}
            </span>
          )}
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-2)' }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
        Live corporate news across NIFTY 500 — never miss a move on your stocks.
      </p>
    </div>
  )
}

function Pill({ children, on, onClick, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: small ? 12 : 13,
        padding: small ? '4px 11px' : '7px 14px',
        borderRadius: 999,
        border: `0.5px solid ${on ? 'var(--text)' : 'var(--border)'}`,
        background: on ? 'var(--text)' : 'var(--surface)',
        color: on ? 'var(--bg)' : 'var(--text-2)',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}

function NewsCard({ item, starred, isNew, onStar }) {
  const tag = TAG_STYLE[item.category] || TAG_STYLE.general
  return (
    <a
      href={item.url}
      target="_blank"            /* opens the source article in a new tab */
      rel="noopener noreferrer"
      style={{
        display: 'block',
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 12,
        padding: '13px 15px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button
          onClick={(e) => { e.preventDefault(); onStar() }}  /* don't follow the link */
          aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          style={{ background: 'none', border: 'none', fontSize: 15, color: starred ? 'var(--star)' : 'var(--text-3)', lineHeight: 1 }}
        >
          {starred ? '★' : '☆'}
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{item.symbol}</span>
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, color: tag.fg, background: tag.bg }}>
          {TAG_LABEL[item.category] || 'news'}
        </span>
        {isNew && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>new</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          {timeAgo(item.ts)} · {item.source}
        </span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--text)' }}>{item.title}</p>
    </a>
  )
}

function SkeletonList() {
  // shimmer placeholders while loading — feels faster than a spinner
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
          <div style={{ width: '40%', height: 12, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 10 }} />
          <div style={{ width: '90%', height: 14, background: 'var(--surface-2)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-3)', fontSize: 14 }}>
      {text}
    </div>
  )
}

function Footer({ visits }) {
  return (
    <div style={{ marginTop: 40, paddingTop: 20, borderTop: '0.5px solid var(--border)', textAlign: 'center' }}>
      {visits != null && (
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text)' }}>{visits.toLocaleString('en-IN')}</strong> visits and counting
        </p>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
        Arthive · news aggregated from public sources · not investment advice
      </p>
    </div>
  )
}
