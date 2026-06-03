# Pitfalls Research

**Project:** Liar's Bar — Multiplayer Browser Card Game
**Domain:** Turn-based multiplayer, polling-based sync, Vercel KV, mobile-first
**Researched:** 2026-06-03

---

## Critical Pitfalls

### 1. Concurrent Turn Submissions Corrupt Game State

**What goes wrong:**
Two players submit an action at the same moment (e.g., the active player plays cards while the challenger simultaneously calls "Liar!"). Both requests hit separate Vercel serverless function instances. Both read the same game state, both pass their own validation checks, and both write back — resulting in an impossible game state: two actions processed in a single turn, or the same turn resolved twice.

In Liar's Bar this is especially dangerous at the challenge moment. The active player and the next player may both POST within the same polling window. Without an atomic guard, both writes succeed.

**Why it happens:**
Vercel serverless functions are stateless and spin up independently. There is no process-level mutex. Two concurrent HTTP requests have no knowledge of each other, so both read-modify-write the Redis game state blob in parallel.

**Warning signs:**
- A turn appears to be skipped with no explanation
- The center pile card count jumps by more than 3 in one poll cycle
- A player's hand drops below 0 cards
- The "Liar!" resolution fires but the game continues on the previous turn
- Two sequential state versions share the same `turnIndex`

**Prevention:**
Use Redis `SET key value NX EX 10` (SET if Not Exists, with a 10-second TTL) as a per-turn lock before any state mutation. The first request to acquire `game:lock` proceeds; the second gets a rejection (HTTP 409 Conflict) and the client retries on the next poll. Release the lock explicitly after the write; TTL auto-releases it if the function crashes mid-execution. This is the minimal safe pattern — a full WATCH/MULTI transaction is an alternative but adds round-trip overhead. Store a monotonic `stateVersion` integer in the game object and increment it with every write; a version mismatch from a stale read is a secondary safeguard.

**Phase:** Address in the core game mechanics phase when writing the first mutating API route. Do not defer — every action handler needs this from day one.

---

### 2. Private Hand Data Leaked to All Clients

**What goes wrong:**
A polling endpoint returns the full game state object, including every player's cards. Any player opens browser DevTools, inspects the JSON response, and sees all opponents' hands. In a bluffing game built around deception, this destroys the core mechanic.

**Why it happens:**
The simplest implementation stores `gameState.players[n].hand = [...]` and returns the whole blob to every client for convenience. It works perfectly in development where you're the only player — the bug is invisible until a real game.

**Warning signs:**
- The `/api/game/state` response contains a `hand` array with card values for players other than the requester
- Any player's client can reconstruct what cards exist in other hands by watching polls over time
- Cards in play can be predicted because the full deck contents are visible

**Prevention:**
The poll endpoint must accept a `playerId` (from a cookie or URL param set at join time) and strip all `hand` fields from the response except the requesting player's own hand. The server returns `hand: [...cards]` for self and `handCount: N` (integer only) for opponents. Validate playerId server-side before redacting — do not trust client-provided filtering. The center pile cards should also remain face-down (only count visible) until a challenge reveal fires.

**Phase:** Address at the very first polling endpoint implementation. This is a game-correctness requirement, not an optimization.

---

### 3. Polling Exhausts the Upstash Free Tier Command Budget

**What goes wrong:**
Six players polling every 2 seconds each fire ~1,800 Redis reads per hour per player. A 30-minute game session with 6 players generates ~324,000 commands. The Upstash free tier (formerly Vercel KV) allows 30,000 commands per day. A single active game session consumes the daily budget in under 6 minutes at a naive poll interval.

**Why it happens:**
Polling is simple to implement — a `setInterval` with a fetch. The command cost is invisible during solo development. The limit is only hit when multiple clients run simultaneously.

**Warning signs:**
- `@upstash/redis` client throws `ERR max daily request limit exceeded`
- The Upstash dashboard shows commands spiking immediately on game start
- Poll errors start accumulating in browser console after a few minutes

**Prevention:**
Design for command efficiency from the start. Use a single Redis `GET` per poll that fetches the entire game state as one serialized JSON string — not multiple HGET/HSET calls. This keeps each poll to 1 command. Only write to Redis when a player submits an action (not on every poll). Consider conditional polling: return a `stateHash` (e.g., short hash of the state string) and have clients track whether it changed; this does not save the GET but avoids heavy React re-renders on unchanged state. For the poll interval, 3–4 seconds is adequate for a turn-based game where humans are reading and deciding — 1-second intervals are unnecessary and quadruple cost. Document the math: 6 players × 3s interval × 60min = 7,200 commands/game well within budget.

**Phase:** Address during the polling architecture setup phase. Choose the interval and command-per-poll budget before writing any client code.

---

### 4. No Orphaned Session Recovery — Stale Game Blocks Everyone

**What goes wrong:**
The host's browser tab crashes or they navigate away mid-game. Because there is only one active game at a time, the orphaned game state in Redis blocks all future games. The next group of players arrives, tries to create a game, and finds an "active game" with ghost players that can never finish. There is no way to reset without direct Redis access.

**Why it happens:**
Polling-based systems have no persistent connection to detect disconnects. There is no WebSocket `onclose` event. A player simply stops polling — the server never knows they left.

**Warning signs:**
- `gameState.status` stays `active` forever
- `lastActivity` timestamp on the game state is hours old
- Players report "game already in progress" when the room is physically empty
- Turn timestamps show no progression for more than 10 minutes

**Prevention:**
Every mutating action (play cards, challenge, roulette click) must write a `lastActivityAt` Unix timestamp to the game state. Each poll response from every client should optionally write a per-player `lastSeenAt` timestamp (use a Redis pipeline to batch this cheaply). A simple background check: if any `GET /api/game/state` call detects that `lastActivityAt` is older than a configurable threshold (e.g., 15 minutes) and the game is not `finished`, auto-expire the session and allow a new game to be created. Alternatively, store the game state key with a Redis TTL of 2 hours — if no write touches it, Redis evicts it automatically. A manual "Abandon Game" button visible to all players (not just the host) is a safety valve.

**Phase:** Address in the session/lobby phase. The auto-expiry TTL should be set when the game key is first written.

---

### 5. Accidental Double-Submission on Mobile Tap

**What goes wrong:**
A player taps "Play" or "Liar!" on their phone. The button registers two taps (double-tap or fast network retry) and the action fires twice. On the first tap the server processes the move correctly. On the second tap — arriving within the same polling window — the server processes a second action against already-advanced state, either throwing an error or (worse, if locking is absent) corrupting state.

**Why it happens:**
Mobile browsers are aggressive about firing click events from touches. Buttons with visual feedback that is delayed (waiting for the server response) invite a second tap from an impatient user. Network latency on mobile means the response confirming the first action may arrive 500ms+ later, during which the user taps again.

**Warning signs:**
- Duplicate POST requests visible in Network DevTools for a single tap
- Action handler receives the same `playerId` + `turnIndex` combination twice in rapid succession
- Players report "my card played but then something weird happened"
- The center pile count increments by more than the declared card count

**Prevention:**
Disable the action button immediately on the first tap (set `isSubmitting` state to `true`) and keep it disabled until the server response arrives. This is the first line of defense. The second line is server-side idempotency: include a client-generated `actionId` (a UUID generated once per intended action) in every POST body; the server checks whether `game.lastActionId === actionId` before processing and rejects duplicates with HTTP 200 (return the current state, not an error). Do not use a loading spinner alone — visually replace the button text with "Submitting…" and block pointer events with CSS `pointer-events: none`.

**Phase:** Address when building the action submission UI components.

---

## Common Mistakes

### 6. setInterval Polling Leak on Component Unmount

**What goes wrong:**
The polling `setInterval` is started in a `useEffect` without a cleanup return. When a player navigates away (game over screen, browser back button) the interval continues running, fires fetches against stale state, and may attempt to call `setState` on an unmounted component — producing "Can't perform a React state update on an unmounted component" warnings and unnecessary Redis reads.

**Warning signs:**
- Console warnings about state updates on unmounted components
- Network tab shows poll requests continuing after the game ends
- Memory usage climbs gradually during a long session

**Prevention:**
Always return a cleanup function from the polling `useEffect`:
```typescript
useEffect(() => {
  const id = setInterval(() => fetchGameState(), POLL_INTERVAL_MS);
  return () => clearInterval(id);
}, []);
```
Stop polling immediately when `gameState.status === 'finished'` by conditionally clearing the interval inside the fetch callback. Consider a custom `usePolling` hook that encapsulates this pattern and enforces the cleanup.

**Phase:** Core polling implementation phase.

---

### 7. Storing Full Deck State Client-Side Enables Shuffle Prediction

**What goes wrong:**
The shuffled deck order is stored in the game state blob and returned with the poll response. A player reading the Redux store or React state in DevTools sees the entire deck — including the face-down draw order for future rounds. In a game with a 20-card deck, this is a meaningful advantage.

**Warning signs:**
- The poll response contains a `deck` array with all remaining cards
- DevTools React component state shows the undealt hand contents

**Prevention:**
Store the full deck only in Redis (server-side). The API response includes dealt hands (filtered per player as per Pitfall 2) and the center pile card count. The `deck` array never leaves the server. When new cards need to be dealt (after roulette reset), the server draws from its stored deck and returns only the new hands. Use a server-side shuffle (Fisher-Yates with `crypto.randomInt`) — do not use `Math.random()` for card ordering as it is not cryptographically random.

**Phase:** Card dealing and deck management phase.

---

### 8. Turn Index Mismatch Causes Ghost Turns

**What goes wrong:**
A client polls, reads `currentTurnPlayerId`, and renders the "It's your turn" prompt. The player acts slowly. Meanwhile, the previous player's action hadn't fully propagated yet, and the poll captured an intermediate state. When the player submits their action, the server's current `turnIndex` has advanced past what the client believed — the action is rejected, but the UI does not reflect why.

**Warning signs:**
- Players report seeing "It's your turn" but getting an error on submission
- The turn indicator flickers between two players during rapid polling
- `turnIndex` in the server state does not match the client's cached value

**Prevention:**
Every action POST must include the `turnIndex` the client observed when deciding to act. The server validates `submitted.turnIndex === game.turnIndex` and rejects mismatches with a clear error (`TURN_ADVANCED`, HTTP 409). The client's error handler for 409 should re-fetch state and re-render without alerting the user — it is a benign race resolved by the next poll. Never render action buttons based on client-local turn tracking; always derive turn authority from the server-returned `currentTurnPlayerId`.

**Phase:** Turn flow implementation phase.

---

### 9. Eliminated Players Can Still Poll-Spam Actions

**What goes wrong:**
An eliminated player's client is still running. There is no server-side check that blocks eliminated players from submitting actions. A bored (or malicious) player submits a "play cards" action, and if the handler lacks a status check, the action processes against a player who should have no agency.

**Warning signs:**
- An eliminated player's `handCount` changes after elimination
- The center pile grows unexpectedly when it is not an eliminated player's turn

**Prevention:**
Every action handler's first validation step: check `player.status !== 'alive'` and reject with HTTP 403. This is a server-side check, not a client-side UI check. The UI disabling action buttons for eliminated players is UX only — the server must enforce it independently.

**Phase:** Player elimination and status management phase.

---

### 10. Missing Round Reset After Roulette — Cards Not Reshuffled

**What goes wrong:**
After a roulette resolution, the game correctly marks the loser. But the round reset (reshuffle all 20 cards, new Table Card, redeal 5 cards to each living player) is either forgotten or only partially implemented. Players with 0 cards in hand — who emptied their hand to go "safe" — never receive new cards. The next round plays with stale hands.

**Why it happens:**
The roulette click handler is focused on the dramatic elimination moment. The round-reset logic is a second distinct responsibility that is easy to split off and then forget to wire up.

**Warning signs:**
- Players who went safe have 0 cards at the start of the next round
- The Table Card remains the same across rounds
- The center pile from the previous round persists into the next

**Prevention:**
Define a single `resetRound(gameState)` pure function that handles the complete reset atomically: collect all 20 cards, shuffle, deal 5 to each `alive` player, set new Table Card, clear center pile, set `currentTurnPlayerId` to the next alive player after the roulette loser. Call this function as the last step of the roulette resolution handler, not as a separate follow-up. Write a unit test for `resetRound` that covers the edge case of a player who just went safe entering the new round with a full hand.

**Phase:** Roulette and round resolution phase.

---

## Phase Mapping

| Phase | Pitfalls to Address | Priority |
|-------|---------------------|----------|
| Session / Lobby setup | Pitfall 4 (orphaned session, TTL), Pitfall 2 (hand data filtering established at schema design) | High |
| Polling architecture | Pitfall 3 (command budget, interval choice), Pitfall 6 (setInterval cleanup) | High |
| First mutating API route | Pitfall 1 (concurrent writes, Redis lock), Pitfall 8 (turnIndex validation) | Critical |
| Card dealing / deck management | Pitfall 2 (hand data redaction), Pitfall 7 (deck stays server-side) | Critical |
| Action submission UI | Pitfall 5 (double-tap, button disable + actionId idempotency) | High |
| Turn flow | Pitfall 8 (ghost turns), Pitfall 9 (eliminated player validation) | High |
| Roulette and round resolution | Pitfall 10 (atomic round reset), Pitfall 9 (status check) | Medium |

---

## Sources

- [Serverless Race Conditions: Redis Locking (Next.js)](https://www.marc0.dev/en/blog/serverless/serverless-race-conditions-redis-locking-guide-next-js-1767987756289)
- [Vercel KV / Upstash Limits — 30K daily commands free tier](https://vercel.com/docs/storage/vercel-kv/limits)
- [JSON in Turn-Based Multiplayer Game with Redis](https://blog.yarsalabs.com/json-turnbased-multiplayer-game-redis/)
- [Concurrent Redis Writes and Correctness](https://dev.to/munawwar/concurrent-redis-writes-and-correctness-3fh3)
- [300ms Tap Delay — Chrome for Developers](https://developer.chrome.com/blog/300ms-tap-delay-gone-away)
- [Memory Leaks in React — setInterval cleanup](https://medium.com/@essaadani.yo/memory-leaks-in-react-next-js-what-nobody-tells-you-91c72b53d84d)
- [Multiplayer game state sync — server as source of truth](https://medium.com/@qingweilim/how-do-multiplayer-games-sync-their-state-part-1-ab72d6a54043)
- [Idempotency Keys in Node.js APIs](https://oneuptime.com/blog/post/2026-01-27-nodejs-idempotency-keys/view)
- [Building Scalable Real-Time Multiplayer Card Games](https://dev.to/krishanvijay/building-scalable-real-time-multiplayer-card-games-3kn6)
