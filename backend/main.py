"""
backend/main.py
===============
THE API. This is what users' browsers actually talk to.

WHY THIS FILE IS SO SHORT:
All the hard work (scanning 500 companies, deduping, categorizing) already
happened in the worker, on a schedule, and the result sits in Redis. So this
file's entire job is: read a Redis key, return it as JSON. That's it.

This is the PAYOFF of the decoupled design:
- The worker is slow (9 min) but runs rarely (every 3h) and alone.
- This API is instant (one Redis read) and runs constantly (every user request).

Because each request is just one Redis GET, this server can handle thousands of
users on a free host without ever hitting Google News or doing heavy work.

    [worker] --writes--> [Redis] <--reads-- [THIS FILE] <--HTTP-- [React app]

RUN IT LOCALLY:
    pip install -r requirements.txt
    # use the SAME Redis the worker wrote to:
    REDIS_URL="rediss://..." uvicorn main:app --reload
    # then open http://localhost:8000/api/news?window=4h

WHAT IT EXPOSES:
    GET /api/news?window=4h   -> {window, meta, items:[...]}
    GET /api/health           -> {ok, redis}
"""
import os
import json

import redis
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware


# ---------------------------------------------------------------------------
# APP SETUP
# ---------------------------------------------------------------------------
app = FastAPI(title="NIFTY News API")

# CORS = Cross-Origin Resource Sharing.
# WHY WE NEED THIS: your React app will run on a DIFFERENT domain than this API
# (e.g. frontend on niftynews.vercel.app, API on niftynews.onrender.com).
# Browsers block cross-domain requests by default for security. This middleware
# tells the browser "it's OK for my frontend to call me."
#
# For now we allow all origins ("*") so local dev just works. When you deploy,
# tighten this to your real frontend URL (see the FRONTEND_ORIGIN note below).
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_methods=["GET", "POST"],   # GET for news, POST for the visit counter
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REDIS CONNECTION
# ---------------------------------------------------------------------------
# We connect LAZILY (only when first needed) instead of at import time. WHY:
# if Redis is briefly unreachable when the server boots, we don't want the whole
# app to crash on startup — we want it to start, and report the problem via
# /api/health. The global `_r` caches the connection after the first use.
_r = None


def get_redis():
    global _r
    if _r is None:
        url = os.environ.get("REDIS_URL")
        if not url:
            raise RuntimeError("REDIS_URL environment variable is not set")
        # decode_responses=True -> Redis returns python str, not raw bytes,
        # so json.loads() works directly without manual .decode().
        _r = redis.from_url(url, decode_responses=True)
    return _r


# The only windows we serve. Anything else falls back to 4h. This is a
# whitelist — it stops someone hitting /api/news?window=../../etc with junk.
VALID_WINDOWS = {"4h", "3d", "7d"}


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------
@app.get("/api/news")
def get_news(window: str = Query("4h", description="One of: 4h, 3d, 7d")):
    """
    Return the pre-computed news for a time window.

    The frontend calls this with ?window=4h / 3d / 7d when the user clicks a
    filter button. We just read the matching Redis key the worker wrote — no
    scanning here, which is what keeps the API instant under load.
    """
    if window not in VALID_WINDOWS:
        window = "4h"  # safe default for any bad input

    r = get_redis()
    raw_items = r.get(f"news:{window}")   # the JSON list the worker stored
    raw_meta = r.get("news:meta")         # {updated_at, counts, ...}

    return {
        "window": window,
        "meta": json.loads(raw_meta) if raw_meta else None,
        # if the worker hasn't run yet, the key is missing -> empty list, so the
        # frontend shows "no news yet" instead of crashing.
        "items": json.loads(raw_items) if raw_items else [],
    }


@app.post("/api/visit")
def record_visit():
    """
    Increment the global visit counter and return the new total.

    WHY A SINGLE REDIS COUNTER: the count must be SHARED across all users —
    a browser-stored number would show everyone "1". Redis INCR is atomic, so
    concurrent visits never collide. The frontend calls this once per load and
    shows the returned total as social proof ("X traders served").
    """
    try:
        total = get_redis().incr("stats:visits")
        return {"visits": int(total)}
    except Exception:
        # never let a counter hiccup break the page
        return {"visits": None}


@app.get("/api/visits")
def get_visits():
    """Read the visit total without incrementing (e.g. for a dashboard)."""
    try:
        v = get_redis().get("stats:visits")
        return {"visits": int(v) if v else 0}
    except Exception:
        return {"visits": None}


@app.get("/api/health")
def health():
    """
    Liveness check. Hit this after deploy to confirm the API can reach Redis.
    Returns {ok:true} only if a Redis PING succeeds.
    """
    try:
        get_redis().ping()
        return {"ok": True, "redis": "connected"}
    except Exception as e:
        return {"ok": False, "redis": str(e)}


@app.get("/")
def root():
    """A friendly landing response so hitting the bare URL isn't a 404."""
    return {
        "service": "Arthive API",
        "endpoints": ["/api/news?window=4h", "/api/visit", "/api/health"],
    }