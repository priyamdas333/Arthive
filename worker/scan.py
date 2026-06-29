"""
worker/scan.py
==============
THE WORKER. Scans Google News for your watchlist and writes results to Redis.

WHY THIS RUNS ON A SCHEDULE, NOT PER REQUEST:
A naive design would fetch news when a user opens the site. At 1000s of users
that means 1000s of identical ~9-minute scans, and Google News blocks the IP
fast. So this worker runs on a schedule (every 3 hours via GitHub Actions),
scans once, and writes the result to Redis. The API then only READS Redis:

    [this worker] --every 3h--> [Redis] <--read by-- [API] <-- users

WHAT IT WRITES TO REDIS:
    news:4h    JSON list, last 4 hours   (intraday view)
    news:3d    JSON list, last 3 days    (swing view)
    news:7d    JSON list, last 7 days    (weekly view)
    news:meta  {updated_at, counts, universe_size}  (for the "updated X ago" UI)

RUN IT:
    pip install feedparser redis
    python scan.py --local --limit 20      # writes news_output.json, no Redis
    REDIS_URL=rediss://... python scan.py  # real run, writes to Redis

NOTE: A BSE-filings source can be added later as a second worker; the API and
frontend are built to merge it in without changes. For now this is news-only.
"""
import os
import sys
import time
import json
import datetime as dt
from urllib.parse import quote_plus

import feedparser


WATCHLIST_FILE = os.environ.get("WATCHLIST_FILE", "companies.txt")
SCAN_DAYS = 7
WINDOWS = {"4h": 4 / 24, "3d": 3, "7d": 7}
POLITE_DELAY = 1.0

INDIAN_SOURCES = {
    "moneycontrol", "economic times", "the economic times", "livemint", "mint",
    "business standard", "business today", "the hindu businessline", "businessline",
    "financial express", "ndtv profit", "cnbc tv18", "cnbctv18", "zee business",
    "et now", "outlook business", "fortune india", "ndtv", "news18",
    "india infoline", "equitymaster", "trendlyne", "upstox", "groww",
}

CATEGORY_RULES = [
    ("results",    ["q1", "q2", "q3", "q4", "net profit", "results", "earnings",
                    "revenue", "ebitda", "profit", "quarterly"]),
    ("order_win",  ["order", "contract", "awarded", "loa", "work order",
                    "letter of intent", "bags", "wins"]),
    ("mna",        ["acquisition", "acquire", "merger", "amalgamation",
                    "stake sale", "divestment", "open offer", "takeover"]),
    ("rating",     ["credit rating", "rating", "icra", "crisil", "care ratings",
                    "upgraded", "downgraded"]),
    ("capital",    ["dividend", "buyback", "bonus", "stock split", "rights issue",
                    "qip", "fund raising", "preferential"]),
    ("regulatory", ["sebi", "income tax", "gst", "penalty", "show cause", "probe",
                    "investigation", "raid"]),
    ("expansion",  ["capacity", "commissioning", "commenced", "plant", "expansion",
                    "capex", "new facility", "invest", "venture"]),
    ("management", ["resignation", "resigns", "appointment", "appointed", "ceo",
                    "managing director", "cfo", "board of directors"]),
]


def classify(title: str) -> str:
    t = title.lower()
    for tag, keywords in CATEGORY_RULES:
        if any(k in t for k in keywords):
            return tag
    return "general"


def load_watchlist(path=WATCHLIST_FILE):
    """Read companies.txt -> [{symbol, name, aliases}]. (Scrip column ignored
    here — the news search only needs the name.)"""
    companies = []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            symbol = parts[0]
            name = parts[1] if len(parts) > 1 and parts[1] else symbol
            aliases = ([a.strip() for a in parts[2].split(",") if a.strip()]
                       if len(parts) > 2 and parts[2] else [])
            companies.append({"symbol": symbol, "name": name, "aliases": aliases})
    return companies


def google_news_rss(company_name: str, days: int) -> str:
    q = f'"{company_name}" when:{days}d'
    return (f"https://news.google.com/rss/search?q={quote_plus(q)}"
            f"&hl=en-IN&gl=IN&ceid=IN:en")


def is_indian_source(source: str) -> bool:
    s = source.lower()
    return any(k in s for k in INDIAN_SOURCES)


def fetch_company(company, cutoff_ts, strict):
    feed = feedparser.parse(google_news_rss(company["name"], SCAN_DAYS))
    items = []
    for e in feed.entries:
        ts = time.time()
        if getattr(e, "published_parsed", None):
            ts = time.mktime(e.published_parsed)
        if ts < cutoff_ts:
            continue
        title = getattr(e, "title", "").strip()
        source = ""
        if " - " in title:
            title, source = title.rsplit(" - ", 1)
        source = source.strip()
        if strict and not is_indian_source(source):
            continue
        hay = title.lower()
        needles = [company["name"].lower()] + [a.lower() for a in company["aliases"]]
        if not any(n in hay for n in needles):
            continue
        items.append({
            "symbol": company["symbol"],
            "name": company["name"],
            "ts": int(ts),
            "iso": dt.datetime.fromtimestamp(ts).isoformat(),
            "title": title.strip(),
            "source": source,
            "category": classify(title),
            "url": getattr(e, "link", ""),
        })
    return items


def dedup(items):
    filler = {"the", "and", "for", "yoy", "qoq", "its", "ltd", "limited",
              "rises", "falls", "per", "cent", "percent", "crore", "cr", "rs",
              "inr", "million", "billion", "over", "wins", "bags", "gets",
              "after", "amid", "with", "from", "into"}
    seen = {}
    for it in items:
        name_words = set()
        for token in (it.get("name", "") + " " + it["symbol"]).lower().split():
            w = "".join(c for c in token if c.isalnum())
            if w:
                name_words.add(w)
        words = "".join(c if c.isalnum() else " "
                        for c in it["title"].lower()).split()
        toks = sorted(set(w for w in words
                          if len(w) > 2 and not w.isdigit()
                          and w not in filler and w not in name_words))[:8]
        key = it["symbol"] + "|" + " ".join(toks)
        if key not in seen:
            seen[key] = it
    return list(seen.values())


def scan(companies, strict=True):
    cutoff = time.time() - SCAN_DAYS * 86400
    all_items = []
    start = time.time()
    for idx, c in enumerate(companies, 1):
        try:
            all_items.extend(fetch_company(c, cutoff, strict))
        except Exception as ex:
            print(f"[{c['symbol']}] error: {ex}", file=sys.stderr)
        if idx % 25 == 0:
            el = time.time() - start
            eta = el / idx * (len(companies) - idx)
            print(f"  ...{idx}/{len(companies)} | {len(all_items)} raw "
                  f"| eta {eta:.0f}s", flush=True)
        time.sleep(POLITE_DELAY)
    all_items = dedup(all_items)
    all_items.sort(key=lambda x: x["ts"], reverse=True)
    return all_items


def split_windows(all_items):
    now = time.time()
    return {name: [it for it in all_items if it["ts"] >= now - days * 86400]
            for name, days in WINDOWS.items()}


def build_meta(windows, universe_size):
    return {
        "updated_at": int(time.time()),
        "updated_iso": dt.datetime.now().isoformat(),
        "universe_size": universe_size,
        "counts": {k: len(v) for k, v in windows.items()},
    }


def write_redis(windows, meta):
    import redis
    url = os.environ.get("REDIS_URL")
    if not url:
        sys.exit("ERROR: REDIS_URL not set. Use --local to test without Redis.")
    r = redis.from_url(url)
    pipe = r.pipeline()
    for name, items in windows.items():
        pipe.set(f"news:{name}", json.dumps(items, ensure_ascii=False))
    pipe.set("news:meta", json.dumps(meta))
    pipe.execute()
    print("OK wrote Redis news:* -> " +
          ", ".join(f"{k}={len(v)}" for k, v in windows.items()))


def write_local(windows, meta, path="news_output.json"):
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "windows": windows}, f, indent=2, ensure_ascii=False)
    print(f"OK wrote {path} -> " +
          ", ".join(f"{k}={len(v)}" for k, v in windows.items()))


def main():
    args = sys.argv[1:]
    local = "--local" in args
    no_strict = "--no-strict" in args
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None

    companies = load_watchlist()
    if limit:
        companies = companies[:limit]
    print(f"News worker: scanning {len(companies)} companies "
          f"(~{len(companies)}s)...", flush=True)

    items = scan(companies, strict=not no_strict)
    windows = split_windows(items)
    meta = build_meta(windows, len(companies))

    if local:
        write_local(windows, meta)
    else:
        write_redis(windows, meta)


if __name__ == "__main__":
    main()