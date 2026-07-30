// src/App.jsx — Arthive, with cold-start handling that keeps users engaged:
//  1. If we have a cached feed, show it INSTANTLY (marked "updating") while the
//     backend wakes — returning visitors basically never see a blank wait.
//  2. If there's no cache (first-ever visit), rotate interesting Indian-market
//     facts during the ~50s wake so the wait feels engaging, not broken.

import { useState, useEffect, useCallback } from 'react'
import { getNews, getCachedNews, recordVisit } from './api.js'

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

// Rotating facts shown ONLY during a cold start with no cached feed.
const MARKET_FACTS = [
  'The BSE, founded in 1875, is Asia\u2019s oldest stock exchange.',
  'NIFTY 50 tracks the 50 largest, most liquid Indian companies on the NSE.',
  'SEBI requires companies to disclose price-sensitive news to exchanges first \u2014 before the media.',
  'The NSE is the world\u2019s largest derivatives exchange by number of contracts traded.',
  '\u201CDalal Street\u201D in Mumbai is India\u2019s Wall Street \u2014 home to the BSE.',
  'A stock hitting its upper circuit means trading is paused after a sharp rise.',
  'The Sensex tracks 30 well-established companies across key BSE sectors.',
  'FII and DII flows \u2014 foreign and domestic institutional money \u2014 often drive daily market moves.',
  'Muhurat trading is a special one-hour Diwali session considered auspicious to trade.',
  'India\u2019s market regulator, SEBI, was given statutory powers in 1992.',
  'A company\u2019s quarterly results can move its stock sharply within seconds of release.',
  'The NIFTY 500 covers about 96% of India\u2019s total listed market capitalisation.',
]

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('arthive-theme') || 'dark'
  )
  const [windowId, setWindowId] = useState('4h')
  const [category, setCategory] = useState('all')
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)      // backend cold-starting
  const [fromCache, setFromCache] = useState(false) // showing stale cached feed
  const [error, setError] = useState(null)
  const [visits, setVisits] = useState(null)

  const [watchlist, setWatchlist] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('arthive-watchlist') || '[]')) }
    catch { return new Set() }
  })
  const [onlyWatchlist, setOnlyWatchlist] = useState(false)

  const [lastSeen] = useState(() =>
    Number(localStorage.getItem('arthive-lastseen') || 0)
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('arthive-theme', theme)
  }, [theme])

  useEffect(() => {
    recordVisit().then(setVisits)
  }, [])

  const load = useCallback(async (win) => {
    setError(null)
    setWaking(false)

    // 1. Instantly show cached feed if we have one, so the screen isn't blank.
    const cached = getCachedNews(win)
    if (cached && cached.items && cached.items.length) {
      setItems(cached.items)
      setMeta(cached.meta)
      setFromCache(true)
      setLoading(false)      // we already have something to show
    } else {
      setFromCache(false)
      setLoading(true)       // nothing cached -> show waking/facts state
    }

    // 2. Fetch fresh data in the background (retries while backend wakes).
    try {
      const data = await getNews(win, (status) => {
        setWaking(status === 'waking')
      })
      setItems(data.items || [])
      setMeta(data.meta || null)
      setFromCache(false)
      if (data.items && data.items.length) {
        localStorage.setItem('arthive-lastseen', String(data.items[0].ts))
      }
    } catch (e) {
      // only show an error if we had nothing cached to fall back on
      if (!cached) setError('Could not load news. Please refresh in a moment.')
    } finally {
      setLoading(false)
      setWaking(false)
    }
  }, [])

  useEffect(() => {
    load(windowId)
    const id = setInterval(() => load(windowId), 3 * 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [windowId, load])

  const toggleStar = (symbol) => {
    setWatchlist((prev) => {
      const next = new Set(prev)
      next.has(symbol) ? next.delete(symbol) : next.add(symbol)
      localStorage.setItem('arthive-watchlist', JSON.stringify([...next]))
      return next
    })
  }

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
        fromCache={fromCache}
        waking={waking}
      />

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

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <Pill key={c.id} small on={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </Pill>
        ))}
      </div>

      {newCount > 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
            {newCount} new since your last visit
          </span>
        </div>
      )}

      {loading ? (
        // No cached feed -> engage the wait with rotating facts (+ skeleton)
        <WakingState waking={waking} />
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

// Shown only when there's NOTHING cached to display during a cold start.
// Rotates a market fact every few seconds so the wait feels alive.
function WakingState({ waking }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * MARKET_FACTS.length))
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % MARKET_FACTS.length)
    }, 4500)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div style={{
        padding: '18px 18px', marginBottom: 14, borderRadius: 12,
        background: 'var(--surface)', border: '0.5px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="pulse-dot" style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: 'var(--green)',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>
            {waking ? 'Waking the news server — fetching the latest…' : 'Loading the latest news…'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Did you know?
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)', margin: 0, minHeight: 44 }}>
          {MARKET_FACTS[idx]}
        </p>
      </div>
      <SkeletonList />
    </div>
  )
}

function Header({ theme, onToggleTheme, meta, fromCache, waking }) {
  const updated = meta?.updated_at ? timeAgo(meta.updated_at) : null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Arthive</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* When showing cached data while waking, say "updating" instead of a time */}
          {fromCache && waking ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber)' }}>
              <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />
              updating…
            </span>
          ) : updated && (
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
            {theme === 'dark' ? '\u2600' : '\u263e'}
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
      target="_blank"
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
          onClick={(e) => { e.preventDefault(); onStar() }}
          aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          style={{ background: 'none', border: 'none', fontSize: 15, color: starred ? 'var(--star)' : 'var(--text-3)', lineHeight: 1 }}
        >
          {starred ? '\u2605' : '\u2606'}
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
