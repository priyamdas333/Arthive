# frontend/ — Arthive React app

The user-facing site. Fetches news from the backend API and renders the feed
with time-window filters, a personal watchlist, dark/light toggle, "new since
last visit" hook, and a visit counter.

## Run locally
```bash
npm install
cp .env.example .env.local      # set VITE_API_URL=http://localhost:8000
npm run dev                     # opens http://localhost:5173
```
The backend must be running (`uvicorn main:app` in backend/) and Redis must have
data (run worker/scan.py once). Then the feed populates.

## Build for production
```bash
npm run build      # outputs dist/ — this is what you deploy to Vercel/Netlify
```

## How it's structured (learning notes)
- `main.jsx` — entry point; mounts <App> into index.html's #root.
- `api.js` — all backend calls in one place (getNews, recordVisit).
- `index.css` — theming via CSS variables; [data-theme="dark"] flips colors.
- `App.jsx` — the whole app. Core React concepts are commented inline:
  - `useState` — data that re-renders the UI when it changes.
  - `useEffect` — side-effects: applying the theme, fetching, auto-refresh.
  - derived data — filtering items for display without extra state.
  - browser persistence — theme, watchlist, "last seen" in localStorage.

## Psychological / stickiness features
- Live "updated X ago" with a pulsing dot (freshness signal).
- "N new since your last visit" (novelty hook for repeat visits).
- 4-hour window front-and-center (trader FOMO).
- Color-coded category tags (materiality at a glance).
- Personal watchlist with ★ (the strongest repeat-visit lever), browser-stored.
- Visit counter in the footer (social proof).
- Dark default with light toggle.

## Environment variable
`VITE_API_URL` — the backend base URL. Local: http://localhost:8000.
Production: your Render URL. Set it in Vercel/Netlify project settings too.