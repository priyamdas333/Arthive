# worker/ — the scheduled scanner

## What this is
`scan.py` scans Google News for every company in `companies.txt`, dedupes,
splits results into 4h/3d/7d windows, and writes them to Redis. It runs on a
schedule (every 3 hours via GitHub Actions), NOT when a user visits.

## Why it's a separate process (the key lesson)
If news were fetched per user visit, 1000 users = 1000 identical ~9-minute
scans and Google News would block the IP. So we decouple fetching from serving:

```
worker (this folder) --every 3h--> Redis <--reads-- backend API <-- users
```

The worker runs once per cycle regardless of traffic; the API only reads Redis,
so it's instant and scales for free.

## Run it
```bash
pip install -r requirements.txt
python scan.py --local --limit 20         # writes news_output.json, no Redis
REDIS_URL="rediss://..." python scan.py   # real run -> Redis
```
Flags: `--local` (file instead of Redis), `--limit N` (first N companies),
`--no-strict` (include non-Indian sources; off by default).

## companies.txt
`SYMBOL | Company Name | optional,aliases`. The name drives the search (Google
News matches names well, tickers badly). Paste your full NIFTY 500 here.

## What it writes to Redis
| key | value |
|-----|-------|
| `news:4h` / `news:3d` / `news:7d` | JSON list of items per window |
| `news:meta` | `{updated_at, counts, universe_size}` |

Item shape: `{symbol, name, ts, iso, title, source, category, url}`.

## Adding BSE filings later (optional)
A BSE-filings source can be added as a second worker writing `bse:*` keys, with
the API merging both. Deferred for now (BSE's endpoint needed extra work); the
architecture already supports dropping it in without touching the frontend.