# Architecture Research

**Project:** Liar's Bar — Multiplayer Card Game
**Researched:** 2026-06-03
**Mode:** Ecosystem — polling-based multiplayer on Vercel

---

## Component Overview

The system has three tiers: browser clients polling an API, Next.js route handlers processing actions, and Upstash Redis holding all game state. There is no persistent server process — every request is a stateless serverless function.

```
Browser (Player A)           Browser (Player B)           Browser (Player C)
    │  poll /api/game/state       │  poll /api/game/state       │
    │  POST /api/game/action      │                             │
    ▼                             ▼                             ▼
Next.js Route Handlers (Vercel serverless — stateless, ephemeral)
    │
    ▼
Upstash Redis (single key: game:current)
```

**Key constraint:** Vercel KV was sunset in December 2024. The Redis integration is now Upstash Redis via the Vercel Marketplace. Upstash exposes a REST/HTTP API — the `@upstash/redis` SDK wraps it and works inside serverless + Edge functions. The free tier gives 500K commands/month, 256MB storage, and supports MULTI/EXEC atomic transactions and Lua scripts.

**One game at a time** means there is no routing complexity. All state lives under a single well-known key namespace. This simplifies every other decision.

---

## Data Model (Redis Schema)

Store the entire game as a single JSON blob under one key. This is the right approach for a turn-based game where every action requires reading + writing multiple fields atomically. Fragmented keys (separate hash per player, separate list for deck) require multi-key transactions that are harder to reason about and offer no real benefit at this scale.

### Primary Key

```
game:current   →  STRING (JSON, serialized GameState)
```

TTL: 4 hours. A finished or abandoned game will expire automatically. When a new game is created, this key is overwritten.

### GameState Shape

```typescript
type CardValue = "A" | "K" | "Q" | "J"; // Ace, King, Queen, Joker

interface PlayerState {
  id: string;           // UUID assigned at join
  name: string;         // Display name
  hand: CardValue[];    // Private — only shown to the owning player
  isAlive: boolean;
  isSafe: boolean;      // Emptied hand this round
  lastSeen: number;     // Unix ms — updated on every poll and action
}

interface PileEntry {
  playerId: string;
  count: number;        // How many cards were played (face-down)
}

type GamePhase =
  | "lobby"       // Waiting for host to start
  | "playing"     // Normal turn flow
  | "challenge"   // Liar! called, awaiting resolution
  | "roulette"    // Loser must pull trigger
  | "round_end"   // Brief pause before reshuffling
  | "game_over";  // One player left alive

interface GameState {
  version: number;            // Monotonically incrementing integer
  phase: GamePhase;
  hostId: string;
  tableCard: "A" | "K" | "Q" | null;
  players: PlayerState[];     // Ordered — index = seat order
  turnIndex: number;          // Index into players[] of active player
  pile: PileEntry[];          // Cards played this round (face-down metadata)
  lastClaim: {                // What the active player declared
    playerId: string;
    count: number;
    card: "A" | "K" | "Q";
  } | null;
  challengeResult: {
    challengerId: string;
    loserId: string;
    revealed: CardValue[];    // Actual cards that were in the pile
  } | null;
  rouletteState: {
    chamber: number;          // 1–6, server-generated, never sent to client
    bulletPosition: number;   // 1–6, server-generated, never sent to client
    result: "survived" | "eliminated" | null;
  } | null;
  deck: CardValue[];          // Remaining draw pile (server-side only)
  createdAt: number;
  updatedAt: number;
}
```

### What clients never see

Strip `deck`, `rouletteState.chamber`, `rouletteState.bulletPosition`, and other players' `hand` arrays before sending the response. Each player receives a view object:

```typescript
interface GameView {
  version: number;
  phase: GamePhase;
  tableCard: "A" | "K" | "Q" | null;
  players: PublicPlayerState[];  // hand replaced with handCount: number
  myHand: CardValue[];           // Only for the requesting player
  turnIndex: number;
  pile: PileEntry[];
  lastClaim: GameState["lastClaim"];
  challengeResult: GameState["challengeResult"];
  rouletteResult: "survived" | "eliminated" | null;  // revealed only after pull
}
```

### Lock Key

```
game:lock   →  STRING "1"  NX EX 5
```

A distributed mutex. Set with SET NX EX (atomic). The value is irrelevant; existence is the lock. TTL of 5 seconds prevents deadlock if a function crashes mid-write.

---

## API Surface

All routes live under `/api/game/`. Use Next.js App Router route handlers.

### GET /api/game/state

Poll endpoint. Returns the current GameView for the requesting player.

Query params: `playerId`, `since` (version number the client already has).

Behavior:
- If `since` equals current `version` → return `{ version, changed: false }`. Client skips re-render.
- If `since` is behind → return full GameView with `changed: true`.
- If no game exists → return `{ phase: "none" }`.

Never return the raw GameState. Always project to GameView before responding.

### POST /api/game/create

Body: `{ playerName: string }`

Creates a new game, sets creator as host. Generates `playerId`, initializes GameState in phase `"lobby"`, returns `{ playerId, gameVersion }`. Overwrites any existing game.

### POST /api/game/join

Body: `{ playerName: string }`

Adds player to lobby. Fails if game is not in `"lobby"` phase or is full (6 players). Returns `{ playerId }`.

### POST /api/game/start

Body: `{ playerId: string }`

Host only. Shuffles deck, deals 5 cards per player, picks table card, sets phase to `"playing"`. Fails if fewer than 2 players.

### POST /api/game/play

Body: `{ playerId: string, cardIndices: number[], declaredCard: "A" | "K" | "Q" }`

Active player plays cards. Validates: correct turn, 1–3 cards, cards exist in hand. Moves cards to pile, records claim, advances turnIndex to next alive non-safe player, bumps version.

### POST /api/game/challenge

Body: `{ playerId: string, action: "liar" | "believe" }`

Next player challenges or believes. If "believe": player must then play their own cards immediately — the action advances the turn. If "liar": reveal pile, determine loser, set phase to `"roulette"`.

Note: "believe" and "play" are combined here. The challenge action includes `cardIndices` and `declaredCard` when `action === "believe"`.

### POST /api/game/roulette

Body: `{ playerId: string }`

Loser pulls the trigger. Server generates a random chamber, compares to bullet position. Sets result to "eliminated" or "survived". Advances phase to `"round_end"` or `"game_over"` as appropriate.

### POST /api/game/reset-round

Body: `{ playerId: string }` (any alive player can trigger, or auto-trigger after roulette)

Reshuffles all 20 cards, re-deals to alive non-safe players, picks new table card, resets pile, advances to next phase.

---

## Polling Strategy

### Client: SWR with refreshInterval

```typescript
const { data } = useSWR(
  `/api/game/state?playerId=${playerId}&since=${lastVersion}`,
  fetcher,
  {
    refreshInterval: 2000,         // Poll every 2 seconds
    revalidateOnFocus: true,       // Catch up immediately when tab refocused
    revalidateOnReconnect: true,   // Catch up after network blip
    dedupingInterval: 1000,        // Dedup rapid re-mounts
  }
);
```

2-second interval is the right call for this game. The tension moment (Liar! is called) should propagate within 2 seconds to all players — acceptable for a party game where everyone is in the same room. 1-second is more responsive but doubles Upstash command consumption; 3-second starts to feel sluggish for the challenge/roulette phases.

### Version-based diff

The `since` parameter is critical. The server returns `{ changed: false }` when version matches. The client ignores this response and does not re-render. This cuts React re-renders by ~80% during inactive turns while keeping the polling cadence constant.

Implementation: store the last-known version in a ref, not state, to avoid the ref update itself causing a render.

### Avoid 304/ETag

Do not rely on HTTP 304 Not Modified. Next.js App Router has known issues with ETag handling in route handlers (see [vercel/next.js#56018](https://github.com/vercel/next.js/issues/56018)). Use the application-level `version` field instead. Return 200 with `{ changed: false }` — simpler and more reliable.

### Active player gets faster feedback

On successful action submission (POST), the client immediately updates local state optimistically, without waiting for the next poll. The `version` returned by the POST response can be used to update the SWR cache directly via `mutate()`.

### Phase-aware polling rate

Optionally slow the poll interval during inactive phases. When `phase === "lobby"` and you are not the host, 3-second polling is fine. During `phase === "roulette"`, keep 2 seconds to catch the result fast. This is an optimization for later; ship with a flat 2-second interval first.

---

## Race Condition Handling

Two players cannot act simultaneously in a well-designed turn-based game, but the server must enforce this because the client cannot be trusted.

### Distributed Lock Pattern

Every write endpoint acquires a Redis lock before reading or modifying game state:

```typescript
// Pseudocode for every POST handler
async function withGameLock(fn: () => Promise<Response>): Promise<Response> {
  const acquired = await redis.set("game:lock", "1", {
    nx: true,   // Only set if not exists
    ex: 5,      // Expire after 5 seconds (deadlock prevention)
  });

  if (!acquired) {
    return Response.json({ error: "Conflict" }, { status: 409 });
  }

  try {
    return await fn();
  } finally {
    await redis.del("game:lock");
  }
}
```

The lock key uses SET NX EX — atomic in Redis. Only one serverless function wins; the other returns 409. The client should retry 409s after a short delay (500ms) with a max of 3 retries before surfacing an error.

Why 5-second TTL on the lock: Vercel's hobby plan has a 10-second function timeout. If a function crashes at 9 seconds, the 5-second TTL means the lock self-releases within 5 seconds. This is the correct tradeoff — no deadlock at the cost of a brief lockout window.

### Turn validation inside the lock

Inside the locked section, always re-read the game state from Redis and re-validate before writing. Never trust state read before lock acquisition:

```
1. Acquire lock
2. Read game:current from Redis
3. Validate: is it this player's turn? Is the phase correct?
4. Apply mutation
5. Increment version
6. Write game:current back
7. Release lock
```

This prevents the "read-then-write" race where Player A reads "it's my turn", Player B also reads "it's my turn", and both submit actions.

### Turn ownership validation

Before any write:
- `state.phase` must match the expected phase for the action
- For `play` and `challenge` with `believe`: `state.players[state.turnIndex].id === playerId`
- For `challenge` with `liar`: the player at `turnIndex` is the challenger, not the active player
- For `roulette`: `state.challengeResult.loserId === playerId`

Return 403 for any ownership violation.

### Idempotency for retries

Each action is not idempotent by design (playing cards twice would be wrong). The lock + turn validation together prevent duplicate processing: if Client A retries and the action already succeeded, version has advanced, and the re-validation will fail (it's no longer A's turn). The retry receives a 403 and the client polls to see the updated state.

---

## Build Order

Build in dependency order. Each layer must be testable in isolation before the next is started.

### 1. Redis foundation + game state types

Define the TypeScript types (GameState, GameView, PlayerState). Write the helper that reads, validates, and projects state. Write the lock wrapper. Test with a scratch script against Upstash directly before any Next.js work. This is the hardest part to get right and must be solid before anything else.

### 2. Create / Join / Lobby UI

`/api/game/create` and `/api/game/join`, plus the landing page and lobby screen. Players can enter a name, see each other's names update via polling, and the host sees a Start button. Validates the full polling loop end-to-end with real Redis before any game logic exists.

### 3. Game start + dealing

`/api/game/start` — shuffle, deal, pick table card, transition to `"playing"`. The game screen skeleton (player list, pile count, own hand) should render from the initial dealt state. No actions yet — just display.

### 4. Play cards (happy path)

`/api/game/play` for the active player. Selecting cards, tapping Play, seeing the pile count increment across devices. This is the core loop. Get it working before challenges.

### 5. Challenge flow

`/api/game/challenge` — both `"liar"` and `"believe"` paths. Card reveal logic, loser determination. The most complex business logic in the game. Test every edge case: Jokers, all-valid pile, all-invalid pile.

### 6. Roulette

`/api/game/roulette` — random result, elimination, phase transitions. The emotional core of the game. Ensure the revealed result (`survived` / `eliminated`) propagates correctly to all clients within 2 poll cycles.

### 7. Round reset + win condition

`/api/game/reset-round`, safe player tracking, last-player-alive detection. Game over screen.

### 8. Inactive player handling

Add last-seen timestamp updates on every poll. On every action validation, check if the active player's `lastSeen` is stale (>90 seconds). If stale, skip their turn: advance `turnIndex` to the next alive player, decrement their card count by 1 (forced discard), bump version. This runs as a side-effect inside the poll endpoint — the player who polls and notices the stale active player triggers the skip. No cron job needed.

Why 90 seconds: a party game with 4 players where each turn can take 30 seconds gives 90 seconds as a generous but not indefinitely blocking threshold.

### 9. Polish

Mobile layout, visual feedback for roulette tension, eliminated player skull indicators, connection error states (show "reconnecting..." when 3 consecutive polls fail).

---

## Constraints and Gotchas

**Upstash free tier command budget.** 500K commands/month. With 6 players polling every 2 seconds, that is 3 commands/second × 3600 s/hr = ~10,800 commands/hour of active play. Budget allows ~46 hours of active play per month before hitting the limit. This is fine for a party game. Promote to Pay-as-you-go ($0.20/100K commands) if needed.

**Serverless cold starts on poll.** The poll endpoint runs on every tick. Vercel keeps warm instances for frequently-hit routes. At 2-second polling with 6 players this is ~3 req/sec — warm enough to avoid significant cold starts in practice.

**Private hands over the wire.** The GET /api/game/state endpoint must accept a `playerId` query param and strip other players' hands. Never send the full GameState to the client. Test this explicitly — a bug here leaks all private information.

**Lock contention window.** The 5-second lock TTL means if a function hangs (slow Upstash response), all other players are locked out for up to 5 seconds. This is acceptable for a party game. Do not set the TTL lower than 3 seconds or you risk a slow-but-successful write racing with a stale-lock retry.

**Upstash does not support WATCH.** Optimistic locking via WATCH/MULTI/EXEC is not available in Upstash's HTTP-based model. Use the SETNX lock pattern instead. This is a simpler model and fully sufficient for this use case.

**Deck cards as private server state.** The `deck` field in GameState is never sent to clients. The full deck state (what's been dealt, what remains) must only be readable server-side. The GameView projection removes this field before responding.

---

## Sources

- [Vercel Next.js Multiplayer Discussion](https://github.com/vercel/next.js/discussions/44100) — confirms polling + SWR as pragmatic serverless approach
- [Redis Matchmaking + Game Session Tutorial](https://redis.io/tutorials/matchmaking-and-game-session-state-with-redis/) — WATCH/MULTI patterns, key naming, TTL strategy
- [Upstash Pipeline & Transaction Docs](https://upstash.com/docs/redis/sdks/ts/pipelining/pipeline-transaction) — MULTI/EXEC atomicity in Upstash
- [Serverless Race Conditions: Redis Locking (Next.js)](https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289) — SET NX EX locking pattern for serverless
- [Redis on Vercel](https://vercel.com/docs/redis) — Vercel KV sunset, Upstash migration, Marketplace integration
- [How to Implement Game State Management with Redis](https://oneuptime.com/blog/post/2026-01-21-redis-game-state-management/view) — turn_order, current_turn, Lua scripts for atomicity
- [ETags in Next.js App Router Discussion](https://github.com/vercel/next.js/discussions/74915) — known ETag issues, use application-level versioning instead
- [Upstash Pricing and Limits](https://upstash.com/docs/redis/overall/pricing) — 500K commands/month free tier
