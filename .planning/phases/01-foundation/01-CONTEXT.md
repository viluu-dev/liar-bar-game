# Phase 1: Foundation - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the Redis data layer, TypeScript game-state types, Zod validation schema, distributed lock wrapper, and per-player view projection — pure infrastructure with no UI or route handlers. Everything in this phase is a shared utility that all subsequent phases import.

</domain>

<decisions>
## Implementation Decisions

### GameState Type Design

- **D-01:** Card type is a string union: `type Card = 'ACE' | 'KING' | 'QUEEN' | 'JOKER'`
- **D-02:** TableCard is a string union: `type TableCard = 'ACE' | 'KING' | 'QUEEN'`
- **D-03:** GameStatus transitions: `'lobby' | 'playing' | 'challenge' | 'roulette' | 'finished'`
  - `lobby` — players joining, waiting for host to start
  - `playing` — active player selecting and playing cards
  - `challenge` — next player deciding Believe / Liar
  - `roulette` — loser pulling the trigger
  - `finished` — one player alive, game over
- **D-04:** Player fields:
  ```ts
  type Player = {
    id: string          // uuid, stable across reconnects
    name: string
    hand: Card[]        // server-only; stripped in projections for other players
    isAlive: boolean
    isSafe: boolean     // true when player emptied their hand this round
    isHost: boolean
    joinedAt: number    // Unix ms timestamp
    lastSeenAt: number  // Unix ms timestamp, updated on each poll
  }
  ```
- **D-05:** GameState root shape:
  ```ts
  type GameState = {
    status: GameStatus
    players: Player[]
    deck: Card[]          // server-only; NOT exposed in any player view
    tableCard: TableCard | null
    pile: Card[]          // server-only; not exposed; clients see pileCount
    pileCount: number     // computed, safe to expose
    currentPlayerIndex: number  // index into players[]
    challengerIndex: number | null  // who must challenge (next in turn)
    lastPlay: LastPlay | null
    roulettePlayerId: string | null  // loser's id, must tap trigger
    roundNumber: number
    winnerId: string | null
    createdAt: number
    updatedAt: number
  }
  
  type LastPlay = {
    playerId: string
    playerName: string
    cards: Card[]       // server-only
    claimedCount: number  // how many Table Cards claimed
    claimedCard: TableCard  // what they claimed to play
  }
  ```
- **D-06:** `ProjectedGameState` (what clients receive) differs from `GameState`:
  - `deck` field: removed entirely
  - `pile` field: removed entirely
  - `lastPlay.cards` field: removed (clients see claimedCount + claimedCard only, cards revealed only on Liar! resolution)
  - Other players' `hand`: replaced with `handCount: number`
  - Own `hand`: exposed in full

### Lock Implementation

- **D-07:** Use `SET NX EX 5` — a 5-second TTL lock on key `game:lock`
- **D-08:** Fail fast on lock contention: throw a typed `LockError` that route handlers map to HTTP 423 Locked. No retry — the 2-second SWR polling loop means the client retries naturally on the next poll cycle.
- **D-09:** `withGameLock<T>(fn: () => Promise<T>): Promise<T>` — acquire lock, run fn, release lock in finally block regardless of outcome.

### View Projection Rules

- **D-10:** `projectGameView(state: GameState, playerId: string): ProjectedGameState` — the ONLY function that creates client-safe state. Route handlers MUST use this before returning state to any client. Never bypass.
- **D-11:** Projection rules:
  - `deck` → omitted
  - `pile` → omitted
  - `lastPlay.cards` → omitted (set to `undefined`)
  - For each player in `players[]`:
    - If `player.id === playerId` → include full `hand` array
    - Else → replace `hand` with `handCount: number` (length of hand array)
- **D-12:** `roulettePlayerId` is exposed to all players (everyone sees who must shoot)
- **D-13:** `currentPlayerIndex` exposed to all — clients know whose turn it is

### Zod Schema Coverage

- **D-14:** Full `GameState` Zod schema — used to validate Redis reads (guards against corrupted or stale data) and to enforce shape correctness in tests
- **D-15:** `PlayerSchema`, `LastPlaySchema`, `GameStateSchema` are composed hierarchically using `z.object()`
- **D-16:** Incoming API payload schemas are defined separately per route (not in this phase) but reuse the type primitives defined here (`z.enum(['ACE','KING','QUEEN','JOKER'])`, etc.)

### File Structure

- **D-17:** All Phase 1 utilities live under `src/` (Next.js App Router convention):
  ```
  src/
    types/
      game.ts           ← TypeScript types only (GameState, Player, Card, etc.)
    lib/
      schemas.ts        ← Zod schemas (GameStateSchema, PlayerSchema, etc.)
      redis.ts          ← Upstash Redis client singleton
      game-state.ts     ← withGameLock, getGameState, setGameState, projectGameView
  ```
- **D-18:** `redis.ts` exports a single `redis` instance — no connection pooling needed (HTTP-based client). Reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from environment.
- **D-19:** `getGameState()` retrieves untyped then casts (workaround for known `@upstash/redis` typed generic bug). Never use `redis.get<GameState>()` — use `redis.get('game:state')` then `GameStateSchema.parse(raw)`.
- **D-20:** Key namespace: `game:state` (game object), `game:lock` (distributed lock)
- **D-21:** TTL: `game:state` key uses 4-hour TTL (`ex: 14400`). Lock key `game:lock` uses 5-second TTL.

### TypeScript Config

- **D-22:** `strict: true` in tsconfig — prevents null/undefined bugs in card/player index access. Next.js 15 sets this by default.

### Claude's Discretion

- Exact error message strings in `LockError` — use descriptive messages, no specific format required
- Whether to export `Card`, `TableCard` etc. as `const` objects (for runtime use) alongside type exports — include both; downstream code will need string values, not just types
- Test file location — `src/lib/__tests__/` co-located with implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Game Rules
- `docs/GAME_PLAY.MD` — Canonical game rules: deck composition (20 cards: 6A/6K/6Q/2J), turn structure, Joker wildcard behavior, challenge resolution, Russian Roulette mechanics, safe-player (empty hand) rule, win condition

### Project Decisions
- `.planning/REQUIREMENTS.md` — All 31 requirements; Phase 1 has no direct requirements but types here must support SESS-01→RNDM-04
- `.planning/PROJECT.md` — Architecture decisions: one active game at a time, polling not WebSocket
- `CLAUDE.md` — Stack decisions: `@upstash/redis` (not `@vercel/kv`), Zod 3.x, TypeScript 5.x, Next.js 15 App Router

### Stack Notes (from CLAUDE.md research)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — required env vars for `@upstash/redis`
- Typed generic bug: do NOT use `redis.get<T>()` — retrieve untyped then cast through Zod schema
- Lock pattern reference: `SET NX EX 5` — described in CLAUDE.md under Key Decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — this is a greenfield project. Phase 1 creates the foundational assets.

### Established Patterns
- None yet — Phase 1 establishes patterns that all subsequent phases follow.

### Integration Points
- `src/lib/game-state.ts` exports (`withGameLock`, `getGameState`, `setGameState`, `projectGameView`) will be imported by every route handler in Phases 2–8
- `src/types/game.ts` types will be imported by all route handlers and UI components
- `src/lib/schemas.ts` Zod schemas will be used for API input validation in all subsequent phases

</code_context>

<specifics>
## Specific Ideas

- The `lastPlay.cards` field is server-side only — clients only see `claimedCount` + `claimedCard`. Cards are only revealed to all clients during a Liar! challenge resolution (Phase 5 exposes them at that moment).
- `pileCount` is a computed integer derived from `pile.length` — safe to include in projected view. The actual `pile` cards are secret until a challenge.
- `lastSeenAt` on Player enables Phase 7's inactive-player detection without adding new fields later.

</specifics>

<deferred>
## Deferred Ideas

- Zod refinements for game rule invariants (e.g. "hand cannot exceed 5 cards") — useful but not required for Phase 1 correctness guarantee; add in Phase 3 if needed
- Redis pipeline for atomic read-modify-write without a lock — overkill for this game's concurrency level; lock is the correct choice

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-03*
