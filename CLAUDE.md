<!-- GSD:project-start source:PROJECT.md -->

## Project

**Liar's Bar — Online Multiplayer Card Game**

A browser-based multiplayer implementation of the Liar's Bar bluffing card game. Players join from their own devices, enter a name, and play a high-stakes bluffing game where losing means pulling a virtual trigger. One active game session at a time. Mobile-first, portrait layout, playful visual style.

**Core Value:** The Russian Roulette moment — the tension of calling "Liar!" and the reveal that follows. Everything else serves that climax.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

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
| SWR | 2.x | Client-side polling for game state | 4.2 KB gzipped (vs 11.4 KB for TanStack Query), built by Vercel, `refreshInterval` prop handles polling, automatic revalidation on tab focus (useful when player switches tabs) |

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
| Function invocations/month | 1 million | At 2s polling × 6 players: ~1,080 invocations/session; free tier supports ~925 game sessions/month |
| Fast Data Transfer (bandwidth) | 100 GB/month | Game state JSON is tiny (<10 KB), no concern |
| WebSockets | Not supported | Confirmed — design decision for polling is correct and required |
| Upstash commands/month | 500K | 1,080 commands/session → ~460 sessions before limit; consider TTL cleanup to limit stale state commands |

## Package Installation

# Create project

# State store

# Polling

# Validation

# Animation

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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
