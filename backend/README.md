# backend/ — the API server

## What this is
A tiny FastAPI app. It reads the news the worker stored in Redis and serves it
to the React frontend over HTTP. It does **no scanning** — that's the worker's
job. This is why it's short and fast.

## Why it's separate from the worker (the lesson)
```
worker (slow, every 3h, alone)  -->  Redis  -->  backend (instant, every request)
```
Heavy work happens once on a schedule; serving is a cheap Redis read. That split
is what lets thousands of users hit this on a free host.

## Endpoints
| route | returns |
|-------|---------|
| `GET /api/news?window=4h` | `{window, meta, items:[...]}` for 4h / 3d / 7d |
| `GET /api/health` | `{ok, redis}` — confirms Redis is reachable |
| `GET /` | service info |

## Run it locally
```bash
pip install -r requirements.txt

# Point at the SAME Redis the worker wrote to:
REDIS_URL="rediss://default:****@****.upstash.io:6379" uvicorn main:app --reload
```
On Windows PowerShell, set the env var separately:
```powershell
$env:REDIS_URL="rediss://default:****@****.upstash.io:6379"
uvicorn main:app --reload
```

Then open:
- http://localhost:8000/api/health  -> should show {"ok":true,...}
- http://localhost:8000/api/news?window=4h  -> your news as JSON
- http://localhost:8000/docs  -> FastAPI's auto-generated interactive API docs

## Environment variables
| var | purpose |
|-----|---------|
| `REDIS_URL` | Upstash connection string (required) |
| `FRONTEND_ORIGIN` | your deployed frontend URL, for CORS. Defaults to `*` for dev. |

## Test order
1. Run the worker first (`python ../worker/scan.py` with REDIS_URL) so Redis has data.
2. Then start this API and hit /api/news. If items is `[]`, the worker hasn't
   run yet or wrote to a different Redis.