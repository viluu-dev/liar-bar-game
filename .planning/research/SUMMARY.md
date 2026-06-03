# Project Research Summary

**Project:** Liar's Bar — Online Multiplayer Card Game
**Domain:** Turn-based browser party game, co-located players, polling-based sync
**Researched:** 2026-06-03
**Confidence:** HIGH

## Executive Summary

Liar's Bar is a bluffing card game for 2–6 co-located players, each on their own phone. The entire product revolves around one moment: calling "Liar!", revealing the cards, and pulling a virtual Russian Roulette trigger. Every architectural and UX decision should serve that climax. Experts build browser-based party games like this as thin stateless API layers over a shared state store, with polling rather than WebSockets for a turn-based pace — and that matches the Vercel Hobby constraint perfectly.

The recommended approach is Next.js 15 (App Router) with Upstash Redis as the sole data store and SWR polling at 2-second intervals. Game state lives as a single JSON blob under one Redis key, protected by a distributed SET NX lock on every write. Every poll endpoint projects a per-player view that strips opponents' hands and the server-side deck before responding — this is not optional, it is the core security boundary of a bluffing game. The roulette moment, challenge reveal, and turn notification UX must be built with deliberate tension mechanics; the rest of the UI can be minimal.

The top risks are concurrent write corruption (mitigated by a Redis lock from the very first API route), private hand data leaking through the poll endpoint (enforce at schema design, not later), and a stale orphaned game blocking all future sessions (solved by a 4-hour Redis TTL on game creation). The Upstash free tier (500K commands/month) supports roughly 460 complete 6-player game sessions per month at 2-second polling — sufficient for a single friend group with clear upgrade economics if needed.

---

## Key Findings

### Recommended Stack

Next.js 15 App Router is the only reasonable choice for a Vercel-hosted greenfield project. Route Handlers in `app/api/` replace the legacy `pages/api/` pattern and map cleanly to the game action surface (create, join, start, play, challenge, roulette). Vercel KV was discontinued in December 2024 — new projects use `@upstash/redis` directly from the Vercel Marketplace. The HTTP-based SDK works in serverless functions without TCP connection management. Polling is handled by SWR's `refreshInterval` — lighter than TanStack Query and purpose-built for this pattern.

**Core technologies:**
- **Next.js 15 (App Router)**: Frontend + API — Vercel-native, Route Handlers, TypeScript-first
- **@upstash/redis**: Game state persistence — HTTP-based (no connection pool), serverless-safe, auto JSON, free tier 500K cmd/month
- **SWR 2.x**: Client polling — `refreshInterval: 2000`, `revalidateOnFocus: true`, 4.2 KB vs 11.4 KB for TanStack Query
- **Zod 3.x**: API validation + GameState schema — parse-don-t-trust all incoming payloads, shared between client and server
- **Motion (motion package)**: Animations — card flip, roulette reveal, elimination fade; import from `motion/react`
- **Tailwind CSS 4.x**: All styling — zero-runtime, `portrait:` variant for orientation rules, no component library needed

**Do not use:** `@vercel/kv` (deprecated), WebSockets/Pusher (not supported on Vercel serverless), `ioredis`/`node-redis` (TCP, incompatible with serverless), Zustand/Redux (game state lives in Redis, SWR is enough).

### Expected Features

The full feature list is in `.planning/research/FEATURES.md`. Summary of priorities:

**Must have (table stakes):**
- Player name entry and lobby with live player list (polling confirms join)
- Whose-turn indicator, per-player card counts, Table Card, pile count — all above the fold in a sticky header
- Card selection with tap-to-select/deselect, explicit Play button (no accidental play), 1-3 card validation
- "Believe" / "Liar!" prompt visible only to the correct next player, unmissable (large CTA)
- Challenge reveal with minimum 500ms pause before card flip
- Roulette: loser must tap — never auto-fire; SAFE vs ELIMINATED instantly legible to all players
- Automatic round reset (reshuffle, new Table Card, re-deal) after every roulette pull
- Eliminated players stay visible, grayed, with skull indicator
- "Your turn" state must be unmistakable — full-screen overlay or strong color change within 2s poll cycle
- Action buttons hidden when not your turn; no silent-ignore tappable elements
- Winner screen with "Play again" option

**Should have (raises quality):**
- Roulette spin animation with 1-2s build-up
- Sound effects (safe click, elimination bang, card flip) — default off, opt-in
- Selected card lift effect for tactile feedback
- Claim history log (last 3-5 plays) for context during challenge decisions
- Screen Wake Lock API to prevent phone sleep mid-session
- Player-joined toast in lobby

**Defer to v2+:**
- In-game chat, avatars/profile pictures, stats/game history, multiple concurrent games/room codes, spectator mode

### Architecture Approach

The system is three tiers: browser clients polling `/api/game/state`, Next.js Route Handlers running as stateless serverless functions, and one Upstash Redis key (`game:current`) holding the entire GameState as a JSON blob. There is no persistent process. All coordination is via Redis: a `game:lock` key (SET NX EX 5) prevents concurrent writes; a monotonically incrementing `version` field enables the poll endpoint to return `{ changed: false }` when state is unchanged, cutting React re-renders by ~80%.

**Major components:**
1. **Redis layer** (`lib/redis.ts`) — Upstash client, `withGameLock()` wrapper, `getGameState()` / `setGameState()`, `projectGameView(state, playerId)` that strips opponents' hands, deck, and roulette internals
2. **Route Handlers** (`app/api/game/`) — one file per action: `state`, `create`, `join`, `start`, `play`, `challenge`, `roulette`, `reset-round`
3. **Game logic** (`lib/game/`) — pure functions: `dealCards()`, `shuffleDeck()` (Fisher-Yates + `crypto.randomInt`), `resolveChallenge()`, `resetRound()`, `checkWinCondition()`, `advanceTurn()`
4. **SWR polling hook** (`hooks/useGameState.ts`) — wraps SWR, handles `changed: false` no-op, exposes `submitAction()` with optimistic update via `mutate()`
5. **UI screens** — Landing/lobby, Game screen (sticky header + player list + hand), Roulette reveal, Game over

**Key data model decisions:**
- Single `game:current` key, 4-hour TTL — simplest possible schema for one-game-at-a-time
- `GameView` projection per player: `myHand: CardValue[]` for self, `handCount: number` for opponents, `deck` never sent
- `version` integer on every state write, `since` query param on every poll — application-level diff, not HTTP ETags (known App Router issues)
- `lastSeen: number` on each PlayerState, updated every poll — enables inactive player detection (90s threshold) without a cron job

### Critical Pitfalls

Full analysis with warning signs in `.planning/research/PITFALLS.md`. Top five, phase-mapped:

1. **Concurrent write corruption** — Two serverless instances can both read-then-write the same state. Use `SET game:lock 1 NX EX 5` before every mutating handler from the first route written. Re-validate turn ownership inside the lock after re-reading from Redis. Phase: first mutating route.

2. **Private hand data leaked through poll endpoint** — Returning full GameState to all clients destroys the bluffing mechanic. Enforce `projectGameView(state, playerId)` at the Redis layer so no route can accidentally skip it. Phase: first poll endpoint — not later.

3. **Orphaned game blocks all future sessions** — Host closes tab, nobody can start a new game. Set 4-hour TTL on `game:current` at creation. Add `lastActivityAt`; if stale > 15 minutes, allow overwrite. Include "Abandon Game" button visible to all players. Phase: lobby / session setup.

4. **Upstash command budget exhausted** — One `GET` per poll (full JSON blob) keeps cost to 1 command/poll. At 2s x 6 players: ~10,800 commands/hour of active play, ~46 hours/month free. Write only on action submission. Phase: polling architecture.

5. **Mobile double-tap double-submission** — Disable action buttons on first tap (`isSubmitting = true`) immediately. Include a client-generated `actionId` UUID in every POST; server rejects if `lastActionId` matches. Phase: action submission UI.

---

## Implications for Roadmap

Based on combined research, the natural build order follows strict dependency layers — each phase must be independently testable before the next begins.

### Phase 1: Foundation — Redis Layer + GameState Types

**Rationale:** Everything depends on this. The TypeScript types, Zod schema, `withGameLock()` wrapper, and `projectGameView()` projection must be correct before any route handler is written. These are the hardest bugs to retrofit.
**Delivers:** `GameState` and `GameView` types, Zod schema, Redis client helpers, lock wrapper, projection function. Testable via scratch script against Upstash.
**Avoids:** Pitfalls 1 (lock), 2 (projection), 7 (deck server-side only) — baked in at schema level before any routes exist.

### Phase 2: Lobby — Create / Join / Polling Loop

**Rationale:** Validates the full tech stack end-to-end with real Redis and real polling before any game logic exists. Bugs in SWR setup, Upstash connectivity, or Next.js Route Handler configuration surface here when consequences are low.
**Delivers:** Landing page (name entry + create/join), lobby screen (player list, host Start button), GET `/api/game/state`, POST `/api/game/create`, POST `/api/game/join`
**Addresses:** Player name entry, live player list, "waiting for host" state, minimum player enforcement, game-start gating
**Avoids:** Pitfall 3 (set polling interval and command budget here), Pitfall 4 (set 4-hour TTL on game creation), Pitfall 6 (SWR handles setInterval cleanup automatically)

### Phase 3: Game Start + Deal + Display

**Rationale:** Establishes the game screen skeleton before any interactive mechanics. Renders dealt hands, Table Card, player list with card counts. No actions yet — pure display. Confirms projection works with real data.
**Delivers:** POST `/api/game/start` (shuffle, deal, table card), game screen layout (sticky header, player list, own hand at bottom)
**Addresses:** 5-card deal, table card display, pile count, mobile portrait layout
**Avoids:** Pitfall 2 (confirm projection strips hands correctly before interactive play begins)

### Phase 4: Core Turn Loop — Play Cards

**Rationale:** The fundamental game action. Get the happy path working across multiple real devices before adding challenge complexity.
**Delivers:** POST `/api/game/play`, card selection UI (tap to select/deselect, lift animation), Play button with `isSubmitting` guard, optimistic update via SWR `mutate()`
**Addresses:** Card selection UX, "X played N Kings" claim display on all screens, turn indicator update within 2s
**Avoids:** Pitfall 1 (lock + turn ownership validation), Pitfall 5 (button disable on tap), Pitfall 8 (turnIndex mismatch)

### Phase 5: Challenge Flow

**Rationale:** The most complex game logic. Resolving a challenge requires reading the pile, checking every card against the Table Card and Joker rules, determining the loser, and transitioning to roulette phase.
**Delivers:** POST `/api/game/challenge` (both "liar" and "believe" paths), challenge result reveal UI (500ms pause + card flip animation), loser determination, roulette phase transition
**Addresses:** "Believe" / "Liar!" prompt on correct player's screen only, card flip reveal, Joker wildcard handling, all-valid / all-invalid / mixed pile edge cases
**Avoids:** Pitfall 9 (eliminated player action validation)

### Phase 6: Roulette + Round Reset

**Rationale:** The emotional core of the game. The roulette moment must be polished — it is the product's primary value. Round reset is its own distinct atomic responsibility.
**Delivers:** POST `/api/game/roulette` (server-side random, result revealed after tap), POST `/api/game/reset-round` (full `resetRound()` pure function), roulette animation + SAFE/ELIMINATED reveal, game-over detection, winner screen
**Addresses:** Loser-taps-trigger requirement, suspense delay, result visible to all within 2 poll cycles, reshuffle + re-deal + new Table Card, safe player tracking, last-player-alive win condition
**Avoids:** Pitfall 10 (atomic round reset as single function, not split across handlers)

### Phase 7: Inactive Player Handling + Error States

**Rationale:** Correctness and robustness for real sessions. Inactive skip logic, disconnected player detection, 409 retry, connection error display.
**Delivers:** `lastSeen` staleness check inside poll handler (90s threshold forces turn skip), consecutive poll failure counter ("reconnecting..." banner after 3 failures), 409 retry logic on client (3 retries, 500ms backoff)
**Addresses:** Ghost turn prevention, host-disconnect recovery

### Phase 8: Polish + Tension Mechanics

**Rationale:** The difference between a working game and a fun game. Animation budget concentrated on roulette sequence. Sound as opt-in enhancement.
**Delivers:** Roulette spin animation, sound effects (safe/bang/card-flip, default off), card deal animation, Screen Wake Lock, eliminated player death animation, player-joined lobby toast, claim history log
**Addresses:** Differentiator features from FEATURES.md
**Avoids:** Long animations blocking interaction (keep non-critical under 600ms); autoplay sound policy (user gesture must unlock audio before first sound plays)

### Phase Ordering Rationale

- Foundation before routes: the lock pattern and projection function cannot be safely retrofitted after routes exist
- Lobby before game logic: validates the full stack with zero game complexity; bugs caught here are cheap
- Display before interaction: confirms data model and projection work before any mutations can corrupt state
- Play before challenge: challenge logic depends on a correctly-populated pile from play actions
- Roulette last in game flow: depends on challenge result; isolation makes the emotional core easier to iterate
- Polish last: tension mechanics built on broken game state are wasted effort

### Research Flags

Phases with standard patterns (research-phase not needed during planning):
- **Phase 1:** Redis + TypeScript types — well-documented, official Upstash SDK
- **Phase 2:** SWR polling + Next.js Route Handlers — standard patterns, high confidence
- **Phase 3:** Deal + display — pure game logic, no external dependencies

Phases that may benefit from targeted research during planning:
- **Phase 5 (Challenge Flow):** Joker wildcard rules and pile resolution edge cases — verify against `docs/GAME_PLAY.MD` before implementation; game rules ambiguity is possible
- **Phase 6 (Roulette animation):** CSS/SVG animation for roulette barrel — worth a quick spike before committing to approach
- **Phase 8 (Sound / Wake Lock):** Web Audio API autoplay policy and Screen Wake Lock Safari compatibility — browser support nuances need verification at implementation time

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All key decisions verified against official docs (Vercel, Upstash, Next.js, SWR, Motion). Mild uncertainty on Tailwind 4 + Next.js 15 PostCSS config — verify on project init. |
| Features | HIGH (mechanics) / MEDIUM (UX) | Game mechanics from official rules. UX patterns derived from cross-domain evidence (Jackbox, poker apps, card game libraries). |
| Architecture | HIGH | Single-blob Redis pattern, SET NX lock, version-based diff, GameView projection — all verified with multiple independent sources. |
| Pitfalls | HIGH | All top pitfalls have clear prevention strategies with verified implementation patterns. Command budget math is confirmed from official Upstash pricing. |

**Overall confidence:** HIGH

### Gaps to Address

- **Game rules edge cases:** `docs/GAME_PLAY.MD` is the authoritative source for Joker behavior, safe-player interactions, and pile resolution edge cases. Read before implementing Phase 5. Research assumed standard Steam Liar's Bar rules.
- **Upstash `get<T>()` typed generic bug:** Multiple community reports of null returns when using typed generics. Workaround is retrieve untyped then cast. Verify this still applies to current SDK version at project start.
- **Tailwind 4 + Next.js 15 PostCSS config:** May require `@tailwindcss/postcss`. Confirm on `create-next-app` output before writing any CSS.
- **Sound autoplay policy:** Web Audio API requires a user gesture before playing audio. The opt-in toggle must be implemented before the first sound plays, not after. Plan the UI affordance during Phase 8 design.
- **Session budget ceiling:** ~460 sessions/month on free Upstash tier before hitting 500K command limit. Not a launch blocker, but document the upgrade path (Upstash Pay-as-you-go at $0.20/100K commands) so the decision is made consciously rather than in a crisis.

---

## Sources

### Primary (HIGH confidence)
- [Vercel Limits (official, updated 2026-05-20)](https://vercel.com/docs/limits) — function invocations, timeout, WebSocket restriction
- [Vercel Redis docs](https://vercel.com/docs/redis) — Vercel KV deprecation, Upstash migration
- [Upstash pricing / free tier](https://upstash.com/docs/redis/overall/pricing) — 500K commands/month, 256 MB storage
- [Next.js Route Handlers (official, updated 2026-06-03)](https://nextjs.org/docs/app/getting-started/route-handlers) — App Router canonical pattern
- [SWR official docs](https://swr.vercel.app/) — `refreshInterval`, `revalidateOnFocus`
- [Motion (Framer Motion) docs](https://motion.dev/docs/react) — `motion/react` import, package rename
- [Upstash Pipeline & Transaction Docs](https://upstash.com/docs/redis/sdks/ts/pipelining/pipeline-transaction) — MULTI/EXEC atomicity

### Secondary (MEDIUM confidence)
- [Serverless Race Conditions: Redis Locking (Next.js)](https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289) — SET NX EX lock pattern
- [ETags in Next.js App Router Discussion](https://github.com/vercel/next.js/discussions/74915) — ETag issues; use application-level versioning
- [Redis Game State Management](https://oneuptime.com/blog/post/2026-01-21-redis-game-state-management/view) — turn_order and version patterns
- [Liar's Bar Steam page](https://store.steampowered.com/app/3097560/Liars_Bar/) — game mechanics reference
- [How to Play Liar's Deck](https://www.debigare.com/how-to-play-liars-deck-from-liars-bar-full-rules-and-variants/) — rule edge cases

### Tertiary (MEDIUM/LOW confidence)
- [Screen Wake Lock API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) — Safari support status (verify at implementation time)
- [Jackbox Games Design Principles](https://www.builtinchicago.org/articles/jackbox-games-design-party-pack) — party game UX heuristics
- Community reports on `@upstash/redis` typed generic `get<T>()` null return bug — workaround documented, root cause unverified in official docs

---
*Research completed: 2026-06-03*
*Ready for roadmap: yes*
