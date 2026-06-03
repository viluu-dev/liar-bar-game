# Phase 1: Foundation - Research

**Researched:** 2026-06-03
**Domain:** Next.js 15 project scaffolding, @upstash/redis data layer, Zod schema design, TypeScript game state types, distributed locking, view projection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Card type: `type Card = 'ACE' | 'KING' | 'QUEEN' | 'JOKER'`
- **D-02:** TableCard type: `type TableCard = 'ACE' | 'KING' | 'QUEEN'`
- **D-03:** GameStatus: `'lobby' | 'playing' | 'challenge' | 'roulette' | 'finished'`
- **D-04:** Player shape with `id`, `name`, `hand`, `isAlive`, `isSafe`, `isHost`, `joinedAt`, `lastSeenAt`
- **D-05:** GameState root shape including `deck`, `pile` (server-only), `pileCount`, `currentPlayerIndex`, `challengerIndex`, `lastPlay`, `roulettePlayerId`, `roundNumber`, `winnerId`, `createdAt`, `updatedAt`
- **D-06:** `ProjectedGameState` strips `deck`, `pile`, `lastPlay.cards`; replaces opponent `hand` with `handCount: number`; exposes own `hand` in full
- **D-07:** Lock key `game:lock`, `SET NX EX 5` (5-second TTL)
- **D-08:** Fail fast on contention — throw typed `LockError`, mapped to HTTP 423. No retry.
- **D-09:** `withGameLock<T>(fn: () => Promise<T>): Promise<T>` — acquire, run fn, release in finally
- **D-10:** `projectGameView(state: GameState, playerId: string): ProjectedGameState` — only function that creates client-safe state. Route handlers MUST use it. Never bypass.
- **D-11–D-13:** Projection rules: `deck` omitted, `pile` omitted, `lastPlay.cards` omitted, opponent hands replaced with `handCount`, `roulettePlayerId` and `currentPlayerIndex` exposed to all
- **D-14–D-16:** Hierarchical Zod schemas (`PlayerSchema`, `LastPlaySchema`, `GameStateSchema`); enum primitives reused across phases
- **D-17:** File structure: `src/types/game.ts`, `src/lib/schemas.ts`, `src/lib/redis.ts`, `src/lib/game-state.ts`
- **D-18:** Single `redis` instance from `redis.ts`, reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- **D-19:** Never use `redis.get<GameState>()` — retrieve untyped, then cast via `GameStateSchema.parse(raw)`
- **D-20:** Key namespace: `game:state`, `game:lock`
- **D-21:** TTLs: `game:state` → 4-hour (`ex: 14400`), `game:lock` → 5-second
- **D-22:** `strict: true` in tsconfig (Next.js 15 default)

### Claude's Discretion

- Exact error message strings in `LockError`
- Whether to export Card/TableCard etc. as `const` objects alongside types (include both — downstream code needs string values)
- Test file location: `src/lib/__tests__/` co-located with implementation

### Deferred Ideas (OUT OF SCOPE)

- Zod refinements for game rule invariants (e.g. hand max 5 cards) — add in Phase 3 if needed
- Redis pipeline for atomic read-modify-write without a lock — overkill; lock is correct choice

</user_constraints>

---

## Summary

Phase 1 is a walking skeleton: scaffold the Next.js 15 project AND deliver the Redis data layer, TypeScript types, Zod schema, distributed lock, and view projection function. No route handlers, no UI — this phase produces the utilities that every later phase imports.

The critical path is: `create-next-app` → install `@upstash/redis` → write `src/types/game.ts` → write `src/lib/schemas.ts` → write `src/lib/redis.ts` → write `src/lib/game-state.ts` → write `src/lib/__tests__/` verification scripts. The scaffold step (create-next-app) generates the tsconfig, Next.js config, Tailwind 4 wiring, and ESLint — the developer only needs to answer the CLI prompts correctly.

The two highest-risk items are (1) the `@upstash/redis` typed generic bug where `redis.get<T>()` can return `null` even on a valid hit — the workaround is always retrieve untyped then cast through Zod — and (2) the distributed lock, which must use `SET NX EX 5` atomically. The `@upstash/lock` library is explicitly NOT recommended for game correctness; raw `redis.set(..., { nx: true, ex: 5 })` with a unique token value and compare-and-delete release is the correct pattern.

**Primary recommendation:** Follow the locked decisions in CONTEXT.md exactly. The file structure (D-17), key namespacing (D-20), TTLs (D-21), and projection rules (D-10–D-13) are the architectural skeleton — get them right in Phase 1 and all later phases compose cleanly on top.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TypeScript game state types | API / Backend lib | — | Server-only types; clients receive `ProjectedGameState` only |
| Zod schema validation | API / Backend lib | — | Validates Redis reads and future API payloads at the server boundary |
| Redis client singleton | API / Backend lib | — | HTTP-based, no persistent connection; singleton avoids per-request client construction overhead |
| Distributed lock (`withGameLock`) | API / Backend lib | — | Every mutating route handler calls this; it must live in a shared server-side utility |
| View projection (`projectGameView`) | API / Backend lib | — | Strips secrets before data leaves the server; never runs on the client |
| `getGameState` / `setGameState` | API / Backend lib | — | Encapsulate Redis read/write; route handlers import these, never call Redis directly |
| Project scaffolding (tsconfig, Next.js config, Tailwind wiring) | Frontend Server (Next.js) | — | Creates the runtime container for all tiers |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.7 [VERIFIED: npm registry] | Framework, App Router, TS config, dev server | Confirmed in CLAUDE.md; locked decision |
| typescript | bundled with next | Type safety, strict mode | Locked per D-22; Next.js 15 sets `strict: true` by default |
| @upstash/redis | 1.38.0 [VERIFIED: npm registry] | HTTP Redis client for game state | Locked in CLAUDE.md; replaces deprecated `@vercel/kv` |
| zod | 4.4.3 [VERIFIED: npm registry] | GameState schema, API validation | Locked in CLAUDE.md; industry standard |
| tailwindcss | 4.3.0 [VERIFIED: npm registry] | Styling | Locked in CLAUDE.md; CSS-first config in v4 |
| @tailwindcss/postcss | 4.3.0 [VERIFIED: npm registry] | PostCSS plugin required by Tailwind 4 | Required for Tailwind 4 to process utility classes in Next.js |

### Supporting (Dev Dependencies)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.8 [VERIFIED: npm registry] | Test runner for lib/ utilities | Phase 1 verification scripts; official Next.js testing guide recommends for unit tests |
| @vitejs/plugin-react | 6.0.2 [VERIFIED: npm registry] | Vitest plugin for React | Required by vitest config even for lib-only tests |
| vite-tsconfig-paths | 6.1.1 [VERIFIED: npm registry] | tsconfig path aliases in vitest | Allows `@/lib/...` imports in test files |
| @testing-library/react | latest | React component testing (future phases) | Not needed Phase 1 but set up now |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | Jest | Vitest starts 10–20x faster, native ESM, TypeScript without extra config; Jest requires `ts-jest` setup |
| raw `SET NX EX 5` lock | `@upstash/lock` library | `@upstash/lock` docs explicitly warn it uses async replication and cannot guarantee correctness; raw `SET NX` is the correct choice for game state |
| `GameStateSchema.parse(raw)` | `GameStateSchema.safeParse(raw)` | `parse()` throws on bad data — correct for `getGameState()` since corrupt Redis state should crash loudly; `safeParse()` is better for user-submitted API input in later phases |

**Installation:**

```bash
# 1. Scaffold project (interactive prompts — choose TypeScript, Tailwind, src/, App Router)
npx create-next-app@latest liar-bar-game

# 2. Redis client
npm install @upstash/redis

# 3. Validation (may already be installed in newer scaffolds — verify)
npm install zod

# 4. Test runner (dev deps)
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @testing-library/react @testing-library/dom jsdom
```

**Version verification performed:**

```
@upstash/redis  1.38.0  (published 2026-06-03) [VERIFIED: npm registry]
zod             4.4.3   (published 2026-05-04) [VERIFIED: npm registry]
next            16.2.7  (published 2026-06-03) [VERIFIED: npm registry]
tailwindcss     4.3.0   (published 2026-06-02) [VERIFIED: npm registry]
@tailwindcss/postcss 4.3.0 (created 2024-02-02) [VERIFIED: npm registry]
vitest          4.1.8   (published recently)    [VERIFIED: npm registry]
@vitejs/plugin-react 6.0.2 (created 2021-09-20) [VERIFIED: npm registry]
vite-tsconfig-paths 6.1.1 (created 2020-08-05) [VERIFIED: npm registry]
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time (pip install failed). All packages below are marked `[ASSUMED]` for legitimacy; however, each package was cross-checked against official documentation and/or the npm registry, and all have multi-year history and very high download counts. The planner should treat these as effectively verified but can add `checkpoint:human-verify` tasks if desired.

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|-----------|-------------|
| @upstash/redis | npm | ~4.5 yrs (2021-10-22) | 3.6M | github.com/upstash/upstash-redis | [ASSUMED] | Approved — referenced in official Vercel docs |
| zod | npm | ~6 yrs (2020-03-07) | 185M | github.com/colinhacks/zod | [ASSUMED] | Approved — industry standard, official Next.js references |
| next | npm | ~14 yrs (2011-07-11) | 39M | github.com/vercel/next.js | [ASSUMED] | Approved — primary framework |
| tailwindcss | npm | ~8 yrs (2017-10-06) | 111M | github.com/tailwindlabs/tailwindcss | [ASSUMED] | Approved |
| @tailwindcss/postcss | npm | ~1.3 yrs (2024-02-02) | 22M | github.com/tailwindlabs/tailwindcss | [ASSUMED] | Approved — official Tailwind project |
| vitest | npm | ~4.5 yrs (2021-12-03) | 65M | github.com/vitest-dev/vitest | [ASSUMED] | Approved — official Next.js testing guide recommends it |
| @vitejs/plugin-react | npm | ~4.7 yrs (2021-09-20) | 59M | github.com/vitejs/vite-plugin-react | [ASSUMED] | Approved |
| vite-tsconfig-paths | npm | ~5.8 yrs (2020-08-05) | 25M | github.com/aleclarson/vite-tsconfig-paths | [ASSUMED] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time — all packages tagged `[ASSUMED]`. Planner may gate installs behind `checkpoint:human-verify` if strict policy required. Practical risk is minimal given multi-year age and 8-figure weekly downloads across all packages.*

---

## Architecture Patterns

### System Architecture Diagram

```
create-next-app scaffold
    │
    ▼
src/types/game.ts
    ├── Card, TableCard, GameStatus (string unions + const objects)
    ├── Player, LastPlay (TypeScript interfaces)
    ├── GameState (full server-side type)
    └── ProjectedGameState (client-safe type, no deck/pile/opponent hands)
         │
         ▼ (Zod mirrors types)
src/lib/schemas.ts
    ├── CardSchema = z.enum([...])
    ├── PlayerSchema = z.object({...})
    ├── LastPlaySchema = z.object({...})
    └── GameStateSchema = z.object({...})
         │
    ┌────┴──────────────────────────────┐
    │                                   │
    ▼                                   ▼
src/lib/redis.ts              src/lib/game-state.ts
Redis.fromEnv()                   │
singleton export                  ├── getGameState()
                                  │     redis.get('game:state')
                                  │     → untyped raw
                                  │     → GameStateSchema.parse(raw)
                                  │     → GameState (typed)
                                  │
                                  ├── setGameState(state)
                                  │     redis.set('game:state', state, {ex: 14400})
                                  │
                                  ├── withGameLock<T>(fn)
                                  │     redis.set('game:lock', uuid, {nx:true, ex:5})
                                  │     ── if null returned → throw LockError (423)
                                  │     ── run fn()
                                  │     ── finally: compare-and-delete lock
                                  │
                                  └── projectGameView(state, playerId)
                                        → ProjectedGameState
                                          (strips deck, pile, opponent hands,
                                           lastPlay.cards)
                                               │
                                               ▼
                                      Route handlers (Phase 2+)
                                      always call projectGameView
                                      before returning JSON to client
```

### Recommended Project Structure

```
liar-bar-game/
├── src/
│   ├── app/                    # Next.js App Router (mostly empty in Phase 1)
│   │   ├── layout.tsx          # Root layout (created by scaffold)
│   │   └── page.tsx            # Home page placeholder
│   ├── types/
│   │   └── game.ts             # TypeScript types only (no Zod here)
│   └── lib/
│       ├── redis.ts            # Upstash Redis singleton
│       ├── schemas.ts          # Zod schemas
│       ├── game-state.ts       # withGameLock, getGameState, setGameState, projectGameView
│       └── __tests__/
│           ├── schemas.test.ts # Zod schema rejection tests
│           ├── game-state.test.ts  # projectGameView, lock behavior
│           └── redis.integration.ts  # Optional: scratch read/write test (success criterion 1)
├── .env.local                  # UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
├── vitest.config.mts           # Test runner config
├── next.config.ts
├── tailwind.config.ts          # (may be auto-generated by scaffold)
├── postcss.config.mjs          # @tailwindcss/postcss plugin
└── tsconfig.json               # strict: true (Next.js 15 default)
```

### Pattern 1: Redis Client Singleton

**What:** Single `Redis` instance created once, shared across all server-side imports via Node.js module singleton.
**When to use:** Always — one instance per process is the correct pattern for HTTP-based clients.

```typescript
// Source: https://upstash.com/docs/redis/tutorials/nextjs_with_redis [CITED]
// src/lib/redis.ts
import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()
// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN automatically
```

### Pattern 2: Untyped Retrieval + Zod Cast (Typed Generic Bug Workaround)

**What:** Never use `redis.get<GameState>(key)` — retrieve untyped, then validate+cast through Zod.
**When to use:** Every Redis GET of game state.

```typescript
// Source: CLAUDE.md documented workaround [CITED: CLAUDE.md]
// src/lib/game-state.ts
import { redis } from './redis'
import { GameStateSchema } from './schemas'
import type { GameState } from '../types/game'

export async function getGameState(): Promise<GameState | null> {
  const raw = await redis.get('game:state')  // untyped — no generic
  if (raw === null) return null
  return GameStateSchema.parse(raw)          // parse throws on corrupt data
}

export async function setGameState(state: GameState): Promise<void> {
  await redis.set('game:state', state, { ex: 14400 })
}
```

### Pattern 3: SET NX EX Distributed Lock with Unique Token

**What:** Atomic lock acquisition using `SET NX EX`. Lock value is a unique UUID — checked on release to prevent a timed-out lock from being released by a different caller.
**When to use:** Wrap every mutating route handler operation.

```typescript
// Source: https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289 [CITED]
// Combined with @upstash/redis SET syntax from https://upstash.com/docs/redis/sdks/ts/commands/string/set [CITED]
// src/lib/game-state.ts

export class LockError extends Error {
  readonly code = 'LOCK_CONTENTION'
  constructor() {
    super('Game is currently being updated. Please try again shortly.')
  }
}

export async function withGameLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockToken = crypto.randomUUID()
  
  // SET game:lock <token> NX EX 5
  // Returns 'OK' if acquired, null if already locked
  const acquired = await redis.set('game:lock', lockToken, { nx: true, ex: 5 })
  
  if (acquired === null) {
    throw new LockError()  // caller maps to HTTP 423
  }
  
  try {
    return await fn()
  } finally {
    // Compare-and-delete: only release if we still own the lock
    // Guards against releasing a lock acquired by another caller after TTL expiry
    const current = await redis.get('game:lock')
    if (current === lockToken) {
      await redis.del('game:lock')
    }
  }
}
```

**Note on `@upstash/lock`:** The official `@upstash/lock` library explicitly states it uses async replication and "should NOT be used to guarantee correctness." Raw `SET NX EX` is the correct choice for game state mutations. [CITED: https://upstash.com/blog/lock]

### Pattern 4: View Projection

**What:** Single function that creates the client-safe view. Must be called before any state is returned to a client.
**When to use:** Every route handler that returns game state.

```typescript
// Source: CONTEXT.md D-10 through D-13 [CITED: .planning/phases/01-foundation/01-CONTEXT.md]
// src/lib/game-state.ts
import type { GameState, ProjectedGameState } from '../types/game'

export function projectGameView(
  state: GameState,
  playerId: string
): ProjectedGameState {
  const { deck, pile, lastPlay, ...rest } = state
  
  const projectedPlayers = state.players.map((player) => {
    if (player.id === playerId) {
      return player  // own hand exposed in full
    }
    const { hand, ...playerRest } = player
    return { ...playerRest, handCount: hand.length }
  })
  
  const projectedLastPlay = lastPlay
    ? (({ cards, ...lp }) => lp)(lastPlay)  // strip cards field
    : null
  
  return {
    ...rest,
    players: projectedPlayers,
    pileCount: pile.length,  // pileCount is safe; pile itself is not
    lastPlay: projectedLastPlay,
    // deck and pile omitted entirely
  }
}
```

### Pattern 5: Zod Schema Composition

**What:** Build schemas hierarchically, derive TypeScript types from them with `z.infer`.
**When to use:** Phase 1 defines all primitive enums; later phases reuse them.

```typescript
// Source: https://zod.dev/api [CITED]
// src/lib/schemas.ts
import { z } from 'zod'

export const CardSchema = z.enum(['ACE', 'KING', 'QUEEN', 'JOKER'])
export const TableCardSchema = z.enum(['ACE', 'KING', 'QUEEN'])
export const GameStatusSchema = z.enum(['lobby', 'playing', 'challenge', 'roulette', 'finished'])

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  hand: z.array(CardSchema),
  isAlive: z.boolean(),
  isSafe: z.boolean(),
  isHost: z.boolean(),
  joinedAt: z.number().int(),
  lastSeenAt: z.number().int(),
})

export const LastPlaySchema = z.object({
  playerId: z.string().uuid(),
  playerName: z.string(),
  cards: z.array(CardSchema),
  claimedCount: z.number().int().min(1).max(3),
  claimedCard: TableCardSchema,
})

export const GameStateSchema = z.object({
  status: GameStatusSchema,
  players: z.array(PlayerSchema),
  deck: z.array(CardSchema),
  tableCard: TableCardSchema.nullable(),
  pile: z.array(CardSchema),
  pileCount: z.number().int().min(0),
  currentPlayerIndex: z.number().int().min(0),
  challengerIndex: z.number().int().min(0).nullable(),
  lastPlay: LastPlaySchema.nullable(),
  roulettePlayerId: z.string().nullable(),
  roundNumber: z.number().int().min(1),
  winnerId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
```

### Pattern 6: TypeScript Types with Runtime const Objects

**What:** Export both TypeScript types (compile-time only) AND const objects (for runtime string values). Downstream code comparing card values needs the const.
**When to use:** For all enum-like string unions in `src/types/game.ts`.

```typescript
// src/types/game.ts
// const objects for runtime use
export const CARDS = ['ACE', 'KING', 'QUEEN', 'JOKER'] as const
export const TABLE_CARDS = ['ACE', 'KING', 'QUEEN'] as const
export const GAME_STATUSES = ['lobby', 'playing', 'challenge', 'roulette', 'finished'] as const

// Types for compile-time checks
export type Card = typeof CARDS[number]
export type TableCard = typeof TABLE_CARDS[number]
export type GameStatus = typeof GAME_STATUSES[number]

// Interfaces
export type Player = {
  id: string
  name: string
  hand: Card[]
  isAlive: boolean
  isSafe: boolean
  isHost: boolean
  joinedAt: number
  lastSeenAt: number
}
// ... (full types per D-04, D-05, D-06 in CONTEXT.md)
```

### Anti-Patterns to Avoid

- **Using `redis.get<GameState>(key)` with typed generic:** The SDK has a known bug where typed generics can return `null` even when data exists. Always retrieve untyped and cast through Zod. [CITED: CLAUDE.md]
- **Using `@upstash/lock` for correctness-critical code:** The library documents that async replication means multiple clients can acquire the lock during a crash. Raw `SET NX EX` is required for game state. [CITED: https://upstash.com/blog/lock]
- **Skipping `projectGameView` in route handlers:** Any direct return of `GameState` to a client leaks opponent hands and the server deck. The projection is the only safe path.
- **Defining `ProjectedGameState` inline in route handlers:** The projection type must be defined once in `src/types/game.ts` and shared — ad-hoc inline types will diverge across phases.
- **Creating Redis client inside a function:** Instantiating per-request wastes HTTP connections and cold-start time. Use the `redis.ts` singleton.
- **Using `redis.set(key, value, { ex: 14400 })` without the TTL:** A game:state key without TTL will persist indefinitely if the cleanup code fails, consuming free-tier storage and polluting state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | Custom type guards | Zod `GameStateSchema.parse()` | Zod handles nested validation, custom error messages, and type inference automatically |
| Typed lock acquisition | Manual SETNX + EXPIRE as two calls | `redis.set(key, val, { nx: true, ex: 5 })` atomic | Two-call SETNX+EXPIRE has a race window between the two commands; single atomic SET NX EX eliminates it |
| UUID generation for lock tokens | Custom ID generation | `crypto.randomUUID()` (built-in Node.js 18+) | No package needed; cryptographically random |
| TypeScript-to-runtime type checking | Custom validator functions | `z.infer<typeof Schema>` + Zod parse | Zod schemas are the single source of truth for both runtime shape and TypeScript type |
| Polling intervals | Long-polling, SSE | SWR `refreshInterval` (Phase 2+) | Already decided; SWR polling is correct for Vercel serverless |

**Key insight:** Phase 1 infrastructure is entirely about choosing the right composition of existing primitives (Redis, Zod, TypeScript). Every problem listed above has a standard solution that handles edge cases the hand-rolled version will miss.

---

## Common Pitfalls

### Pitfall 1: Typed Generic Bug — `redis.get<T>()`

**What goes wrong:** `redis.get<GameState>('game:state')` returns `null` even when the key exists and contains valid data, causing getGameState() to incorrectly report no active game.
**Why it happens:** Known SDK serialization bug in `@upstash/redis` where the typed generic path has different deserialization behavior than the untyped path. Multiple developers have reported this in community sources.
**How to avoid:** Always call `redis.get('game:state')` (no generic) then pass the result to `GameStateSchema.parse(raw)`.
**Warning signs:** `getGameState()` returns null immediately after `setGameState()` succeeds; intermittent null returns in tests.

### Pitfall 2: Lock Release on Wrong Owner

**What goes wrong:** Function A acquires the lock, takes longer than 5 seconds (edge case), TTL expires, Function B acquires the lock, Function A finishes and deletes the lock, now Function B is unprotected.
**Why it happens:** Naive `redis.del('game:lock')` in the finally block doesn't check ownership.
**How to avoid:** Compare lock value before deleting. The `withGameLock` pattern stores the lock token UUID and retrieves before deleting to verify ownership (see Pattern 3 above).
**Warning signs:** Race conditions in tests when simulating concurrent writes with 6+ second delays.

### Pitfall 3: Tailwind 4 PostCSS Setup

**What goes wrong:** `globals.css` uses old `@tailwind base; @tailwind utilities;` directives from Tailwind 3, or the PostCSS config is missing `@tailwindcss/postcss`, causing styles to not compile.
**Why it happens:** Tailwind 4 changed from `@tailwind` directives to `@import "tailwindcss"` and from `tailwindcss` PostCSS plugin to `@tailwindcss/postcss`.
**How to avoid:** `create-next-app` with the `--yes` flag scaffolds Tailwind 4 correctly. If manual, use `postcss.config.mjs` with `"@tailwindcss/postcss": {}` and `@import "tailwindcss"` in globals.css.
**Warning signs:** All Tailwind classes render as unstyled; Next.js dev server shows PostCSS errors.

### Pitfall 4: `game:state` vs `game:current` Key Inconsistency

**What goes wrong:** STATE.md mentions `game:current` as the Redis key but CONTEXT.md D-20 locks the key as `game:state`. Using mixed key names across phases causes reads to return null and writes to be invisible.
**Why it happens:** STATE.md is a project-level notes file, not a specification. D-20 in CONTEXT.md is the locked decision.
**How to avoid:** Use `game:state` everywhere (per D-20). The planner should note that STATE.md's reference to `game:current` is an inconsistency — `game:state` is canonical.
**Warning signs:** `getGameState()` returns null despite a successful earlier `setGameState()` call.

### Pitfall 5: Node.js Version Below Minimum

**What goes wrong:** `npx create-next-app` fails or produces warnings; `crypto.randomUUID()` not available (requires Node.js 14.17+, well below our Node.js 22.9 but worth documenting).
**Why it happens:** Next.js 15/16 requires Node.js >= 20.9. The current machine has Node.js v22.9.0 — compliant.
**How to avoid:** Already addressed — Node.js v22.9.0 is installed and compliant.
**Warning signs:** `create-next-app` outputs "Node.js version >= v20.9.0 is required."

### Pitfall 6: Missing `.env.local` During Verification Tests

**What goes wrong:** Verification scripts that call `getGameState()` or `setGameState()` fail with "UPSTASH_REDIS_REST_URL is required" because env vars are not set locally.
**Why it happens:** `.env.local` is gitignored and must be created manually with real Upstash credentials.
**How to avoid:** Include a Wave 0 task to document `.env.local` setup. The scratch verification script (success criterion 1) requires real credentials — it cannot run in CI without secrets.
**Warning signs:** `Redis.fromEnv()` throws at import time; tests that mock Redis avoid this but integration tests do not.

---

## Code Examples

### Redis Client Setup

```typescript
// Source: https://upstash.com/docs/redis/tutorials/nextjs_with_redis [CITED]
// src/lib/redis.ts
import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()
// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN automatically
```

### Zod Schema — Correct Parse Pattern

```typescript
// Source: https://zod.dev/api [CITED]
// Use .parse() for server-internal validation (throws on bad data — loud failure is correct)
const state = GameStateSchema.parse(raw)

// Use .safeParse() for user-submitted API input (future route handlers)
const result = GameStateSchema.safeParse(body)
if (!result.success) {
  return Response.json({ error: result.error.flatten() }, { status: 400 })
}
```

### Upstash SET with TTL

```typescript
// Source: https://upstash.com/docs/redis/sdks/ts/commands/string/set [CITED]
// game:state with 4-hour TTL
await redis.set('game:state', state, { ex: 14400 })

// Lock with 5-second TTL, NX (only if not exists)
const acquired = await redis.set('game:lock', lockToken, { nx: true, ex: 5 })
// Returns 'OK' if acquired, null if key already exists
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@vercel/kv` for Vercel Redis | `@upstash/redis` directly | December 2024 | `@vercel/kv` is deprecated; new projects must use `@upstash/redis` |
| Tailwind `@tailwind base/utilities` directives | `@import "tailwindcss"` + `@tailwindcss/postcss` | Tailwind 4 (2024) | Old directives do nothing in Tailwind 4 |
| `tailwind.config.js` with `content` paths | CSS-first `@theme` directive, auto content detection | Tailwind 4 (2024) | No `content` array needed |
| Jest for Next.js unit tests | Vitest | 2022-present | Vitest is ESM-native, 10-20x faster startup, official Next.js docs now guide Vitest first |
| `framer-motion` npm package | `motion` npm package, `import from 'motion/react'` | 2024 | Rebranded; old package still works but canonical is `motion` |
| Pages Router (`pages/api/`) | App Router Route Handlers | Next.js 13+ (2022), standard 2024 | App Router is the current standard; Pages Router is maintained but legacy |

**Deprecated/outdated:**

- `@vercel/kv`: Discontinued December 2024. Replaced by direct `@upstash/redis` from the Vercel Marketplace.
- `framer-motion` package: Still works but rebranded to `motion`. CLAUDE.md explicitly forbids `framer-motion` — use `motion` package.
- `redis.get<T>()` typed generic: Functionally broken in `@upstash/redis` — documented workaround is always retrieve untyped then cast.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@upstash/redis` typed generic `get<T>()` null bug is present in v1.38.0 | Pitfalls / Code Examples | If fixed in 1.38.0, the workaround is still safe but unnecessarily verbose — low risk |
| A2 | `create-next-app` with `--yes` scaffolds Tailwind 4 (not Tailwind 3) when latest Next.js is installed | Standard Stack / Pitfalls | If it installs Tailwind 3, the PostCSS config and globals.css directives will be different — requires manual migration |
| A3 | Zod version is 4.4.3 (not 3.x as documented in CLAUDE.md) | Standard Stack | CLAUDE.md says "Zod 3.x" but npm registry shows 4.4.3. API is compatible for the schemas designed here; however the planner should note that Zod 4 has some breaking changes from Zod 3 — the schema patterns in this document are written for Zod 4 syntax which is current |

---

## Open Questions

1. **Zod 3.x vs 4.x**
   - What we know: CLAUDE.md specifies Zod 3.x but npm registry shows current version is 4.4.3. The schema patterns above use Zod 4 API which is compatible with the designs in CONTEXT.md.
   - What's unclear: Whether the project intends to pin to Zod 3.x or use current 4.x. Zod 4 has some breaking changes from 3.x (different error formatting, changed some method signatures).
   - Recommendation: Default to latest (4.4.3) unless the developer explicitly wants 3.x; the schemas designed here work with both. The planner should note this for the developer to confirm.

2. **Lock release atomicity**
   - What we know: The compare-and-delete release (GET + conditional DEL) is two operations, not atomic. A theoretical race exists between the GET and the DEL.
   - What's unclear: Whether this is acceptable for this game's consistency requirements.
   - Recommendation: For a party game with 2-second polling and a 5-second lock TTL, the non-atomic release is acceptable. CONTEXT.md D-08 explicitly says "fail fast" with no retry — this design is consistent with that. A Lua script could make it atomic but adds complexity not warranted here. Proceed with the two-step release.

3. **`game:current` vs `game:state` key name**
   - What we know: STATE.md references `game:current` but CONTEXT.md D-20 locks the key as `game:state`.
   - What's unclear: Whether STATE.md's mention of `game:current` was a typo or an earlier decision.
   - Recommendation: Use `game:state` per D-20. This is a locked decision. STATE.md is a living status document, not a specification.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js (min 20.9), `crypto.randomUUID()` | Yes | v22.9.0 | — |
| npm | Package installation | Yes | 10.8.3 | — |
| git | Version control | Yes | 2.50.1 | — |
| Upstash Redis (cloud) | `@upstash/redis`, success criterion 1 | Unknown | — | Cannot run integration tests without credentials; unit tests can mock the client |
| create-next-app | Project scaffolding (Wave 0) | Yes (via npx) | 16.2.7 | — |

**Missing dependencies with no fallback:**
- Upstash Redis credentials (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) — required for success criterion 1 (scratch read/write test) and success criterion 2 (lock test). The developer must create an Upstash account and provision a database before these tests can run. Unit tests for schema validation and view projection can run without credentials.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.mts` — Wave 0 creates this |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map

Phase 1 has no formal requirement IDs (it is pure infrastructure). The success criteria defined in the phase description map directly to test behaviors:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|------------------|----------|-----------|-------------------|-------------|
| SC-1: Write/read GameState round-trip | `setGameState()` then `getGameState()` returns correct typed object | integration | `npx vitest run src/lib/__tests__/redis.integration.ts` | Wave 0 |
| SC-2: Lock prevents concurrent write | Second `withGameLock()` call while first holds lock throws `LockError` | unit (mocked Redis) | `npx vitest run src/lib/__tests__/game-state.test.ts` | Wave 0 |
| SC-3: `projectGameView` strips opponent hands | Caller receives `handCount` not `hand` for other players; own hand present | unit | `npx vitest run src/lib/__tests__/game-state.test.ts` | Wave 0 |
| SC-4: Zod schema rejects malformed payload | `GameStateSchema.parse(badData)` throws `ZodError` | unit | `npx vitest run src/lib/__tests__/schemas.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/__tests__/schemas.test.ts src/lib/__tests__/game-state.test.ts` (unit tests only; no network)
- **Per wave merge:** `npx vitest run --reporter=verbose` (all tests including integration)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/schemas.test.ts` — covers SC-4 (Zod rejection tests)
- [ ] `src/lib/__tests__/game-state.test.ts` — covers SC-2 (lock contention), SC-3 (projection)
- [ ] `src/lib/__tests__/redis.integration.ts` — covers SC-1 (requires real Upstash credentials)
- [ ] `vitest.config.mts` — Vitest config with `vite-tsconfig-paths`, `jsdom` environment
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @testing-library/react @testing-library/dom jsdom`

---

## Security Domain

> `security_enforcement: true` in config.json. ASVS Level 1 applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No accounts; players identified by UUID only |
| V3 Session Management | Partial | Player UUID stored client-side; `lastSeenAt` for timeout detection — no session token validation in Phase 1 |
| V4 Access Control | Yes | `projectGameView` enforces that no client receives another player's hand; this IS the access control for card data |
| V5 Input Validation | Yes | `GameStateSchema.parse()` validates all Redis reads; later phases use Zod for API inputs |
| V6 Cryptography | No | No cryptographic operations in Phase 1; `crypto.randomUUID()` for lock token is a CSPRNG — correct |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client requests another player's hand via crafted playerId | Information Disclosure | `projectGameView(state, playerId)` enforces projection; tested in SC-3 |
| Concurrent state mutation corrupting GameState | Tampering | `withGameLock()` with `SET NX EX 5` prevents concurrent writes |
| Stale/corrupted Redis data accepted as valid GameState | Tampering | `GameStateSchema.parse(raw)` rejects malformed data; tested in SC-4 |
| Lock held indefinitely after process crash | Denial of Service | 5-second TTL auto-releases the lock even if process dies |
| Lock token forgeable (attacker guesses lock value) | Elevation of Privilege | `crypto.randomUUID()` is a 128-bit CSPRNG — infeasible to guess |

**Phase 1 security summary:** The view projection and Zod validation are the two critical security controls established here. Both must be tested before Phase 2 route handlers are written — once a route handler returns `GameState` directly (bypassing projection), detecting and fixing that leak is much harder.

---

## Project Constraints (from CLAUDE.md)

All directives are locked. Planner must verify compliance against these:

| Directive | Category | Constraint |
|-----------|----------|------------|
| `@upstash/redis` (not `@vercel/kv`) | Required tool | `@vercel/kv` is deprecated Dec 2024; must use `@upstash/redis` |
| Next.js 15 App Router | Required pattern | No Pages Router, no `pages/api/` |
| TypeScript 5.x, `strict: true` | Required | All files must be TypeScript; strict mode on |
| Zod 3.x | Required tool | API validation and schema (note: current version is 4.x — see Open Questions) |
| SWR 2.x for polling | Required (Phase 2+) | No long-polling, no WebSockets |
| `motion` package, `import from 'motion/react'` | Required (Phase 3+) | Not `framer-motion` |
| Tailwind CSS 4.x | Required | CSS-first config, `@import "tailwindcss"` |
| No WebSockets / Pusher / Ably | Forbidden | Vercel serverless does not support persistent connections |
| No `@vercel/kv` | Forbidden | Deprecated |
| No `redis` (ioredis/node-redis) | Forbidden | TCP connections incompatible with serverless |
| No Zustand / Redux | Forbidden | Client state via SWR; no global state store |
| No Prisma / ORM | Forbidden | Redis only; no relational DB |
| No Next-auth / Auth.js | Forbidden | No authentication; players identify by name |
| No `framer-motion` package | Forbidden | Use `motion` package instead |
| Do not use `redis.get<T>()` typed generic | Required workaround | Retrieve untyped, cast through Zod |
| `game:state` key with 4-hour TTL | Required | Key namespace per D-20/D-21 |
| `projectGameView` on every client-facing response | Required | Never bypass projection |

---

## Sources

### Primary (HIGH confidence)

- [CITED: nextjs.org/docs/app/getting-started/installation — version 16.2.7, updated 2026-06-03] — create-next-app prompts, TypeScript setup, Node.js minimum (20.9)
- [CITED: nextjs.org/docs/app/getting-started/project-structure — version 16.2.7, updated 2026-06-03] — src/ directory, lib/ conventions, App Router file hierarchy
- [CITED: nextjs.org/docs/app/guides/testing/vitest — version 16.2.7, updated 2026-06-03] — Vitest setup, required packages, vitest.config.mts
- [CITED: upstash.com/docs/redis/sdks/ts/commands/string/set] — SET command syntax, `nx: true`, `ex:` option, return value
- [CITED: upstash.com/docs/redis/sdks/ts/commands/string/get] — GET command, typed generic behavior
- [CITED: upstash.com/docs/redis/tutorials/nextjs_with_redis] — `Redis.fromEnv()` pattern, singleton setup
- [CITED: upstash.com/blog/lock] — `@upstash/lock` library caveat: not for correctness guarantees due to async replication
- [CITED: zod.dev/api] — z.enum(), z.object(), z.array(), z.infer, parse vs safeParse
- [CITED: tailwindcss.com/docs/guides/nextjs] — Tailwind 4 PostCSS setup, `@import "tailwindcss"`, `@tailwindcss/postcss`
- [CITED: CLAUDE.md] — Stack decisions, forbidden packages, typed generic bug workaround, Vercel KV deprecation
- [CITED: .planning/phases/01-foundation/01-CONTEXT.md] — All locked decisions D-01 through D-22

### Secondary (MEDIUM confidence)

- [CITED: marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289] — SET NX EX locking pattern, fail-fast on contention
- [npm registry — @upstash/redis 1.38.0, published 2026-06-03] — version and download verification
- [npm registry — zod 4.4.3, published 2026-05-04] — version confirmation (note CLAUDE.md says 3.x)

### Tertiary (LOW confidence)

- WebSearch results on Tailwind 4 + Next.js 15 — corroborated by official Tailwind docs

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified on npm registry against official documentation
- Architecture: HIGH — patterns derived from official Upstash docs, CONTEXT.md locked decisions, and Next.js docs
- Pitfalls: MEDIUM-HIGH — typed generic bug is ASSUMED in 1.38.0 (documented in training + CLAUDE.md but not re-verified against 1.38.0 specifically); other pitfalls verified from official sources
- Test setup: HIGH — Vitest config from official Next.js testing guide

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (30 days — stable stack)
