## Project

**Liar's Bar — Online Multiplayer Card Game**

A browser-based multiplayer implementation of the Liar's Bar bluffing card game. Players join from their own devices, enter a name, and play a high-stakes bluffing game where losing means pulling a virtual trigger. One active game session at a time. Mobile-first, portrait layout, playful visual style.

**Core Value:** The Russian Roulette moment — the tension of calling "Liar!" and the reveal that follows. Everything else serves that climax.

## Technology Stack

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15 (App Router) | Frontend + API backend | Vercel-native, Route Handlers replace `pages/api`, standard Web Request/Response API, TypeScript-first |
| TypeScript | 5.x | Type safety | Mandatory for game state schemas — prevents card/player index bugs at compile time |
| React | 19 (bundled with Next.js 15) | UI | Included with Next.js, no separate choice needed |

### State Store

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @upstash/redis | latest (~1.38.x) | Game state persistence | HTTP-based (no persistent connection, works in serverless), designed for Vercel/Next.js, automatic JSON serialization |

- **Vercel KV is discontinued.** As of December 2024, Vercel KV stores were migrated to Upstash Redis. New projects install Upstash Redis directly from the Vercel Marketplace.
- **Free tier:** 256 MB storage, 500K commands/month, 10 GB bandwidth/month, 10 MB max request size, 100 MB max record size, 10K max commands/second.
- **No connection pool:** `@upstash/redis` uses REST/HTTP — no TCP connection management, no connection exhaustion in serverless.
- **TTL:** Full TTL support. Use `redis.setex(key, ttlSeconds, value)` or `redis.set(key, value, { ex: ttlSeconds })`.
- **Auto JSON:** `redis.set` / `redis.get` serializes/deserializes JS objects automatically. Do NOT use typed generics on `get<T>()` — known serialization bug causes null returns. Retrieve untyped, then cast.
- **Key pattern:** Namespace all keys. Single game: `game:state` for the game object, `game:players` if needed as a separate list.
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Polling / Data Fetching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SWR | 2.x | Client-side data fetching + resilience fallback for game state | 4.2 KB gzipped (vs 11.4 KB for TanStack Query), built by Vercel, `refreshInterval` prop handles polling, automatic revalidation on tab focus (useful when player switches tabs). No longer the primary update mechanism — see Realtime / Push below — but kept as a ~12s fallback poll so the game stays playable if the push connection drops. |

### Realtime / Push

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Ably (`ably` npm package) | 2.x | Push notification of game-state changes | Managed pub/sub reachable from Vercel serverless functions via a simple REST publish call (no self-hosted WebSocket server needed). Chosen over Pusher for its monthly (not daily-reset) message quota and higher free-tier connection cap (200 vs 100 concurrent connections). Server publishes a lightweight `{ version }` signal on `game:{joinCode}` after every real state change (hooked into `setGameState` in `lib/redis.ts`); clients subscribe via a scoped, short-lived token (`/api/ably-token`) and refetch the existing, already-redacted `GET /api/game/state` response on receipt. Redis remains the sole source of truth — Ably never carries game state itself, since per-player hand data must stay redacted and a channel is visible to every subscriber in that game. |

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | 3.x | API route input validation + game state schema | Industry standard for TypeScript runtime validation, parse-don't-trust all incoming route payloads, share schemas between frontend and backend |

### Animation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Motion (formerly Framer Motion) | latest (`motion` package) | Card flip, tap feedback, roulette reveal | 30M+ npm downloads/month, native Web Animations API under the hood (120fps capable), built-in gesture recognizers for touch that are more reliable than CSS `:hover`, import from `motion/react` |

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | All styling | Zero runtime CSS, works with Next.js App Router without configuration, mobile-first by default, `flex` layouts for card hand, `portrait:` variant for orientation-specific rules |

### TypeScript / Code Quality

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| eslint + typescript-eslint | latest | Lint | Bundled with `create-next-app`, keep defaults |
| Prettier | 3.x | Formatting | Standard |

## Platform Constraints (Vercel Hobby Tier)

| Constraint | Limit | Impact on This Project |
|------------|-------|----------------------|
| Function execution timeout (default) | 10 seconds | All Redis reads + writes must complete in well under 10s — trivially met |
| Function execution timeout (max) | 60 seconds | Not relevant for this game |
| Function invocations/month | 1 million | Primary updates now arrive via Ably push, not polling; the SWR fallback poll (~12s × 6 players) uses a small fraction of the invocation budget that 2s polling used to consume |
| Fast Data Transfer (bandwidth) | 100 GB/month | Game state JSON is tiny (<10 KB), no concern |
| WebSockets (native, Vercel Functions) | Available in public beta (June 2026) but capped at 5 min/connection on Hobby tier (30 min needs Pro/Enterprise), pinned to a single Function instance, no built-in cross-instance broadcast | Evaluated and rejected for this project — would require building a manual internal-Redis-polling relay per connection to fan out across instances, plus reconnect-every-5-minutes handling. Ably (managed pub/sub) used instead; see Technology Stack. |
| Upstash commands/month | 500K | Heartbeat writes on every poll no longer trigger a publish (see `setGameState`'s `{ publish: false }` option), and the fallback poll interval is ~6x longer than the old 2s primary interval, so command volume is well under the old ceiling |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Self-hosted WebSocket server (raw `ws`, Socket.io) | Incompatible with serverless's ephemeral, per-invocation processes — there's no long-lived process to hold connections open. This is the real constraint behind the old "no WebSockets" rule. It does NOT mean managed pub/sub SDKs can't be used from a route handler — Ably's SDK is used in this project (see Technology Stack) and works fine, since publishing is just an outbound HTTPS call, no different from any other API client already used here. |
| Pusher | Considered alongside Ably for the realtime push layer; rejected in favor of Ably for its monthly (not daily-reset) message quota and higher free-tier connection cap. Not a "never use," just the runner-up. |
| Native Vercel WebSocket (beta) | Available since June 2026 but capped at 5 min/connection on Hobby tier with no cross-instance broadcast — see Platform Constraints. Rejected for this project in favor of Ably. |
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

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
