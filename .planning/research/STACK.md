# Stack Research

**Project:** Liar's Bar — multiplayer browser card game  
**Researched:** 2026-06-03  
**Constraints:** Vercel Hobby tier, polling (no WebSocket), Upstash Redis for state, Next.js, mobile-first portrait

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15 (App Router) | Frontend + API backend | Vercel-native, Route Handlers replace `pages/api`, standard Web Request/Response API, TypeScript-first |
| TypeScript | 5.x | Type safety | Mandatory for game state schemas — prevents card/player index bugs at compile time |
| React | 19 (bundled with Next.js 15) | UI | Included with Next.js, no separate choice needed |

App Router is the right choice over Pages Router for a greenfield 2025 project despite reported P95 latency regressions in some migrations. For a turn-based party game with 2–6 players, those differences are irrelevant. App Router is the supported path forward.

Route Handlers live in `app/api/<action>/route.ts`. Each game action (join, play, challenge, roulette) gets its own route file. Example: `app/api/game/play/route.ts` exports `POST`.

### State Store

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @upstash/redis | latest (~1.38.x) | Game state persistence | HTTP-based (no persistent connection, works in serverless), designed for Vercel/Next.js, automatic JSON serialization |

Key facts verified against official Upstash docs and Vercel docs:

- **Vercel KV is discontinued.** As of December 2024, Vercel KV stores were migrated to Upstash Redis. New projects install Upstash Redis directly from the Vercel Marketplace.
- **Free tier:** 256 MB storage, 500K commands/month, 10 GB bandwidth/month, 10 MB max request size, 100 MB max record size, 10K max commands/second.
- **No connection pool:** `@upstash/redis` uses REST/HTTP — no TCP connection management, no connection exhaustion in serverless.
- **TTL:** Full TTL support. Use `redis.setex(key, ttlSeconds, value)` or `redis.set(key, value, { ex: ttlSeconds })`.
- **Auto JSON:** `redis.set` / `redis.get` serializes/deserializes JS objects automatically. Do NOT use typed generics on `get<T>()` — known serialization bug causes null returns. Retrieve untyped, then cast.
- **Key pattern:** Namespace all keys. Single game: `game:state` for the game object, `game:players` if needed as a separate list.

Environment variables injected by Vercel Marketplace integration:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Polling / Data Fetching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SWR | 2.x | Client-side polling for game state | 4.2 KB gzipped (vs 11.4 KB for TanStack Query), built by Vercel, `refreshInterval` prop handles polling, automatic revalidation on tab focus (useful when player switches tabs) |

SWR is correct for this project. TanStack Query's extra features (mutations, optimistic updates, devtools) add bundle overhead that buys nothing here — all mutations go through `fetch()` POST calls, and game state is always fetched fresh from Redis.

Polling setup:
```ts
const { data: gameState } = useSWR('/api/game/state', fetcher, {
  refreshInterval: 2000,       // 2 seconds while tab active
  revalidateOnFocus: true,     // catches returning players
  dedupingInterval: 1000,
})
```

**Recommended polling interval: 2 seconds.** Rationale: turn-based party game, players are in the same room so they self-coordinate turns. 2s is fast enough to feel responsive, slow enough to stay well under the Upstash 500K/month command budget. At 2s with 6 players: 3 req/player/min × 6 players × 60 min/session = ~1,080 commands/session. Well within free tier even for hundreds of sessions.

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | 3.x | API route input validation + game state schema | Industry standard for TypeScript runtime validation, parse-don't-trust all incoming route payloads, share schemas between frontend and backend |

Define one central `GameState` Zod schema. Use it to validate both what goes into Redis and what API routes receive. This prevents corrupt state from bad clients.

### Animation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Motion (formerly Framer Motion) | latest (`motion` package) | Card flip, tap feedback, roulette reveal | 30M+ npm downloads/month, native Web Animations API under the hood (120fps capable), built-in gesture recognizers for touch that are more reliable than CSS `:hover`, import from `motion/react` |

Use Motion for: card selection tap animation, "Liar!" reveal sequence, roulette button tension animation, player elimination fade. Keep it restrained — party game energy, not an entertainment app.

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | All styling | Zero runtime CSS, works with Next.js App Router without configuration, mobile-first by default, `flex` layouts for card hand, `portrait:` variant for orientation-specific rules |

No separate component library needed. The game UI is bespoke — cards, player slots, a roulette button. A general component library (shadcn, MUI) adds dead weight and fights the custom game aesthetic. Build raw with Tailwind.

### TypeScript / Code Quality

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| eslint + typescript-eslint | latest | Lint | Bundled with `create-next-app`, keep defaults |
| Prettier | 3.x | Formatting | Standard |

---

## Platform Constraints (Vercel Hobby Tier)

These are hard limits that affect architecture decisions, verified from official Vercel docs (last updated 2026-05-20):

| Constraint | Limit | Impact on This Project |
|------------|-------|----------------------|
| Function execution timeout (default) | 10 seconds | All Redis reads + writes must complete in well under 10s — trivially met |
| Function execution timeout (max) | 60 seconds | Not relevant for this game |
| Function invocations/month | 1 million | At 2s polling × 6 players: ~1,080 invocations/session; free tier supports ~925 game sessions/month |
| Fast Data Transfer (bandwidth) | 100 GB/month | Game state JSON is tiny (<10 KB), no concern |
| WebSockets | Not supported | Confirmed — design decision for polling is correct and required |
| Upstash commands/month | 500K | 1,080 commands/session → ~460 sessions before limit; consider TTL cleanup to limit stale state commands |

**Invocation budget note:** 1M invocations/month is the tighter constraint vs Upstash's 500K commands for this use case. At 2s polling with 6 active players, you get roughly 460–500 complete game sessions per month on free tier before hitting either limit. This is fine for a party game used by one friend group.

---

## Package Installation

```bash
# Create project
npx create-next-app@latest liar-bar --typescript --tailwind --app --src-dir --import-alias "@/*"

# State store
npm install @upstash/redis

# Polling
npm install swr

# Validation
npm install zod

# Animation
npm install motion
```

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| WebSockets / Pusher / Ably | Not supported on Vercel serverless functions. Project constraint. Polling is sufficient for a turn-based party game where players self-coordinate. |
| `@vercel/kv` | Deprecated. Vercel KV was discontinued December 2024. Use `@upstash/redis` directly. |
| TanStack Query (React Query) | 11.4 KB gzipped vs SWR's 4.2 KB. The extra features (devtools, mutations, retry logic) are not needed here. SWR's `refreshInterval` covers polling completely. |
| Pages Router (`pages/api/`) | Legacy. App Router is the current Next.js standard. No reason to use Pages Router for a greenfield project. |
| Socket.io | Requires persistent server process. Incompatible with Vercel serverless. |
| `redis` (ioredis / node-redis) | These use TCP connections which are incompatible with serverless cold starts and connection limits. `@upstash/redis` is HTTP-based and the correct choice for Vercel. |
| Prisma / database ORM | No relational DB in this stack. Redis is the only data store needed for game state. |
| Next-auth / Auth.js | No authentication needed. Players identify by name only, no accounts. |
| Framer Motion (`framer-motion` package) | Rebranded to `motion`. Import from `motion/react` using the `motion` npm package. The old `framer-motion` package still works but the canonical package is now `motion`. |
| React Spring + `@use-gesture/react` | More complex API than Motion for this use case. Motion's built-in touch gesture support is sufficient. |
| Zustand / Redux | No client-side global state needed. Game state lives in Redis, fetched via SWR. A simple `useState` per page is enough. |
| Long-polling | Adds implementation complexity (held connections, timeout handling) with no meaningful latency benefit for a turn-based game. Simple polling at 2s is correct. |

---

## Confidence Levels

| Area | Confidence | Evidence |
|------|------------|---------|
| Next.js App Router for greenfield | HIGH | Official Next.js docs confirm Route Handlers are the current standard, Pages Router is maintained but legacy |
| `@upstash/redis` (not `@vercel/kv`) | HIGH | Official Vercel docs (last updated 2026-01-13) explicitly state Vercel KV is discontinued; Upstash is the replacement |
| Upstash free tier limits (256 MB, 500K/month) | HIGH | Verified directly from Upstash pricing page |
| Vercel function invocation limits (1M/month Hobby) | HIGH | Verified from official Vercel limits page (last updated 2026-05-20) |
| Vercel WebSocket not supported | HIGH | Explicitly stated in official Vercel limits docs |
| SWR `refreshInterval` for polling | HIGH | Verified from SWR official docs and confirmed via search |
| 2-second polling interval | MEDIUM | Based on turn-based game pacing principles and budget math; no single official source dictates this, but consensus from game dev community and budget analysis supports it |
| Motion (formerly Framer Motion) package rename | HIGH | Official Motion docs confirm `motion/react` import path from `motion` package |
| Tailwind 4.x with Next.js App Router | MEDIUM | Tailwind 4 is current but compatibility notes with Next.js 15 may require `@tailwindcss/postcss` — check on project init |
| Zod for validation | HIGH | Established standard, multiple 2025 sources confirm, first-party Next.js guides reference it |
| `get<T>()` typed generic bug in `@upstash/redis` | MEDIUM | Reported by multiple developers in community sources; workaround (retrieve untyped, then cast) is well-documented |

---

## Sources

- [Vercel Limits (official, updated 2026-05-20)](https://vercel.com/docs/limits)
- [Vercel Redis docs — confirms KV deprecation](https://vercel.com/docs/redis)
- [Upstash Redis pricing / free tier limits](https://upstash.com/docs/redis/overall/pricing)
- [Next.js Route Handlers (official, updated 2026-06-03)](https://nextjs.org/docs/app/getting-started/route-handlers)
- [SWR official site](https://swr.vercel.app/)
- [TanStack Query polling docs](https://tanstack.com/query/latest/docs/framework/react/guides/polling)
- [Motion (Framer Motion) React docs](https://motion.dev/docs/react)
- [Upstash Redis npm package](https://www.npmjs.com/package/@upstash/redis)
- [Upstash Next.js tutorial](https://upstash.com/docs/redis/tutorials/nextjs_with_redis)
- [Serverless race conditions + Redis locking](https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289)
