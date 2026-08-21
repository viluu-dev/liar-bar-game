# Liar's Bar: Round-Table Gameplay Redesign

This document specifies a redesign of the active-play screen: players seated
around a round table, turn/roulette state shown spatially, and several
interaction simplifications. It is written for whoever implements it — it
names concrete files, functions, and signatures rather than restating the
UX requirements in prose.

## 0. Summary of changes and files touched

| # | Requirement | Primary files touched |
|---|---|---|
| 1 | Circular seating | `components/RoundTable.tsx` (new), `lib/seat-layout.ts` (new), `components/GameScreen.tsx` |
| 2 | Spatial "roulette motif" for turn/chamber state | `components/PlayerSeat.tsx` (new), `components/TriggerTimer.tsx` (new) |
| 3 | Remove standalone Believe; play = implicit belief | `app/api/game/play/route.ts`, `lib/game-logic.ts`, `components/CardHand.tsx`, `components/ChallengeDecision.tsx` (deleted) |
| 4 | Flip-reveal animation on "Liar!" | `components/ChallengeReveal.tsx`, `package.json` (motion) |
| 5 | Visible countdown + auto-pull | `lib/types.ts`, `lib/schemas.ts`, `lib/constants.ts`, `lib/game-logic.ts`, `app/api/game/state/route.ts`, `components/TriggerTimer.tsx` |
| 6 | Pile as a table object with a count badge | `components/PlayedPile.tsx` (new), `components/TableCard.tsx` |

`PlayersList.tsx` and `ChallengeDecision.tsx` are each imported only once, from
`components/GameScreen.tsx` — both can be fully deleted and replaced rather
than kept as legacy fallbacks.

## 1. Current behavior being replaced

- State machine (`lib/types.ts` `GameStatus`): `lobby | playing | challenge | roulette | finished`.
- `components/GameScreen.tsx` renders exactly one of three things based on
  `gameState.status`: `ChallengeDecision` (Believe/Liar buttons, hand hidden),
  `ChallengeReveal` (static card reveal + instant trigger button, no timer), or
  `CardHand` (play cards).
- `app/api/game/challenge/route.ts`: `action: 'believe'` performs a real state
  transition (`challenge` → `playing`, the challenger becomes the current
  player) that is separate from actually playing cards — today this is two
  screens and two network round-trips. `action: 'liar'` resolves the challenge
  (or the Devil Card mass-penalty path) into `status: 'roulette'`.
- `components/PlayersList.tsx` is a plain vertical list, no circular geometry.
- `components/TableCard.tsx` shows the pile count as always-visible plain
  text ("Round N • {pileCount} cards in pile").
- `components/ChallengeReveal.tsx` reveals played cards as static bordered
  divs with no animation. `motion` (declared as `framer-motion` in
  `package.json`) is used nowhere in `components/` today — a clean slate.
- `lib/game-logic.ts`'s `autoSkipIfInactive` (90s silent AFK threshold, called
  from `GET /api/game/state` on every poll) is the only existing auto-action
  mechanism; it does not cover `status === 'roulette'`.

## 2. Decisions

These were confirmed explicitly rather than assumed:

1. **Table orientation: egocentric.** Each viewer's own seat is always at the
   bottom of their screen; other players fan out around the circle relative to
   them. No two players see an identical frame.
2. **Roulette countdown: 10 seconds** before auto-pull.
3. **Pile interaction: always-visible small count badge** on the pile object —
   not a hover/tap-to-reveal interaction, since `:hover` isn't reliable on a
   mobile-first, touch-primary app.
4. **Legacy `believe` action: kept** in the API as harmless dead surface. It
   becomes unreachable from the redesigned UI but is not actively removed —
   no functional gain from deleting it, and it avoids a breaking API change.

Implementation-detail defaults (recommended, not blocking):

- The card-flip reveal is staggered per card (~150ms apart), with the verdict
  banner fading in only after the last flip finishes — a beat of suspense
  rather than an instant reveal, matching the project's stated core value
  ("the tension of calling Liar and the reveal that follows").
- If a roulette countdown expires during a Devil Card mass-penalty (multiple
  pending shooters), all remaining pending shooters auto-pull together, since
  they share one countdown start-timestamp — not one-at-a-time with a fresh
  clock each.
- This project currently has zero React component tests (all existing tests
  are in `lib/*.test.ts` / `app/api/*/route.test.ts`). Whether to introduce
  component tests as part of this work, or rely on the `verify` skill
  (real two-player browser run-through) for UI correctness, is left to the
  implementer to decide when this is picked up.

## 3. State-machine/API change: collapsing "believe" into "play"

**Extend `POST /api/game/play` to accept being called while
`status === 'challenge'` by the designated challenger**, performing the
believe-transition and the play atomically inside the existing
`withGameLock` block. Do not add a new endpoint, and do not have the client
chain two fetches (believe, then play) — that's exactly the two-round-trip
fragility this change removes: if the second call fails or races against a
poll/Ably refetch, the player is left "believed" with the turn already
theirs but nothing played.

A brand-new combined endpoint was considered and rejected: it would duplicate
all of `play/route.ts`'s existing validation (hand-index bounds, duplicate
indices, Devil Card detection, next-challenger computation, roulette-fallback
when there's no eligible next challenger) behind a new URL for no benefit.

### Route change

Extract `app/api/game/play/route.ts`'s current body (hand-index validation,
Devil detection, pile update, next-challenger computation, roulette fallback)
into a pure function in `lib/game-logic.ts`:

```ts
export function applyCardPlay(
  state: GameState,
  playerIndex: number,
  cardIndices: number[],
  declaredCard: TableCard,
  now: number
): GameState
```

`app/api/game/play/route.ts` becomes:

```ts
const gameState = await getGameState(joinCode)
let effectiveState = gameState
let playerIndex: number

if (gameState.status === 'challenge') {
  if (gameState.challengerIndex === null) throw new Error('No challenger set for this challenge')
  const challenger = gameState.players[gameState.challengerIndex]
  if (challenger.id !== playerId) throw new Error('Only the designated challenger can respond')
  if (!challenger.isAlive) throw new Error('Eliminated players cannot challenge')
  if (challenger.isSafe) throw new Error('Safe players cannot play cards')
  effectiveState = {
    ...gameState,
    status: 'playing',
    currentPlayerIndex: gameState.challengerIndex,
    challengerIndex: null,
    lastPlay: null,
  }
  playerIndex = gameState.challengerIndex
} else if (gameState.status === 'playing') {
  playerIndex = gameState.players.findIndex(p => p.id === playerId)
  if (playerIndex !== gameState.currentPlayerIndex) throw new Error('It is not your turn')
} else {
  throw new Error('Game is not in playing phase')
}

const updatedGameState = applyCardPlay(effectiveState, playerIndex, cardIndices, declaredCard, Date.now())
await setGameState(updatedGameState)
return updatedGameState.version
```

The `isSafe` guard is defensive: `CardHand` only ever offers a "Play" action
when the hand is non-empty, so a safe (hand-empty) challenger never reaches
this path from the UI, but the route should not trust that.

This is a single lock acquisition, a single `setGameState` write, a single
version bump — matching the "one action = one version" pattern the rest of
the API already follows.

`POST /api/game/challenge` is untouched except for the new
`roulettePhaseStartedAt` field (section 5). Its `action: 'liar'` branch
remains the only thing the redesigned UI's "Liar!" button calls.

## 4. Merging `ChallengeDecision` into `CardHand`

Delete `components/ChallengeDecision.tsx`. Extend `components/CardHand.tsx`:

```ts
interface CardHandProps {
  cards: Card[]
  isMyTurn: boolean            // true for a normal turn OR for the challenger during 'challenge'
  gameStatus: GameStatus
  myDevilRank: TableCard | null
  onPlay?: (selectedIndices: number[]) => Promise<void>
  lastPlay?: ProjectedLastPlay | null   // NEW — claim being judged, only meaningful when gameStatus === 'challenge'
  onLiar?: () => Promise<void>          // NEW — wired to POST /api/game/challenge {action:'liar'}
}
```

- When `gameStatus === 'challenge'`, render a compact claim banner above the
  card grid (reuse `ChallengeDecision`'s existing "`{playerName} played
  {claim}`" formatting).
- The action row becomes `[Liar!] [Play (N)]` instead of the old
  `[Believe] [Liar!]`. "Play" stays disabled until 1-3 cards are selected,
  exactly as today; "Liar!" is tappable whenever `isMyTurn && gameStatus ===
  'challenge'`, independent of card selection.
- Non-challengers now render their hand read-only instead of not rendering it
  at all — this is what satisfies "the Liar button must not hide the current
  player's hand," and as a side effect every player sees their hand at all
  times, not just the one currently deciding.
- `components/GameScreen.tsx`'s three-way status ternary collapses to two-way:

```tsx
{gameState.status === 'roulette' ? (
  <ChallengeReveal ... />
) : (
  <CardHand
    cards={gameState.myHand}
    isMyTurn={
      gameState.status === 'playing'
        ? gameState.players[gameState.currentPlayerIndex]?.id === playerId
        : gameState.players[gameState.challengerIndex ?? -1]?.id === playerId
    }
    gameStatus={gameState.status}
    myDevilRank={gameState.myDevilRank}
    lastPlay={gameState.status === 'challenge' ? gameState.lastPlay : null}
    onPlay={handlePlay}
    onLiar={handleLiar}
  />
)}
```

`handleChallenge(action)` in `GameScreen.tsx` simplifies to `handleLiar()`
(hardcoding `action: 'liar'`), since `'believe'` is no longer client-reachable.

## 5. Roulette countdown — end to end

### Server: new field

Add `roulettePhaseStartedAt: number | null` to `GameState` and
`ProjectedGameState` in `lib/types.ts`, and to `GameStateSchema` /
`ProjectedGameStateSchema` in `lib/schemas.ts` as `.nullable().default(null)`.
The `.default(null)` keeps the test blast radius small — existing fixture
objects across `lib/game-logic.test.ts`, `lib/redis.test.ts`,
`lib/projection.test.ts`, `lib/schemas*.test.ts`, and the route tests
continue to validate unmodified; only tests that care about the new value
need to set it explicitly.

`lib/redis.ts`'s `projectGameView` passes it through unconditionally (it's a
timestamp, not sensitive, unlike `pile`/`deck`):
```ts
roulettePhaseStartedAt: state.roulettePhaseStartedAt,
```

**Set** (`Date.now()`) at every site that transitions `status` into
`'roulette'`:
- `app/api/game/play/route.ts`'s "no eligible next challenger" auto-roulette
  branch — after the section 3 refactor, this lives inside `applyCardPlay`.
- `app/api/game/challenge/route.ts`'s Devil mass-penalty branch and normal
  single-loser branch.

**Cleared** (`null`) in `app/api/game/roulette/route.ts` whenever roulette
resolves away from that status (both the `finished` branch and the
round-reset-back-to-`playing` branch). Left untouched when a Devil mass
penalty still has pending shooters remaining — they all entered the roulette
phase at the same instant and share one countdown; one shooter pulling early
does not extend anyone else's remaining time.

### Duration constant

New constant in `lib/constants.ts`:
```ts
export const ROULETTE_COUNTDOWN_MS = 10_000 // visible UI pacing timer — distinct from the 90s silent AFK threshold
```

This is a deliberately different concern from `autoSkipIfInactive`'s 90s
threshold: that value exists to silently detect a genuinely abandoned player
across a multi-minute game; the roulette countdown is a dramatic,
always-visible pacing device and needs to be short enough to keep momentum.

### Server: auto-pull on expiry

Do not overload `autoSkipIfInactive` with a second threshold — it's a
different status, a different timestamp basis (`roulettePhaseStartedAt`, not
per-player `lastSeenAt`), and a much shorter, always-visible duration. Add a
new sibling function in `lib/game-logic.ts`:

```ts
export function autoPullIfRouletteExpired(
  state: GameState,
  now: number,
  countdownMs = ROULETTE_COUNTDOWN_MS
): GameState | null
```

To avoid duplicating `app/api/game/roulette/route.ts`'s chamber-check /
elimination / win-condition / round-reset logic, first extract that route's
core into a pure function, mirroring the `applyCardPlay` extraction:

```ts
export function applyRoulettePull(
  state: GameState,
  playerId: string,
  now: number
): { state: GameState; result: 'safe' | 'eliminated' }
```

`app/api/game/roulette/route.ts` becomes a thin wrapper calling this inside
its lock. `autoPullIfRouletteExpired` then does:

```ts
if (state.status !== 'roulette' || state.roulettePlayerIds.length === 0) return null
if (state.roulettePhaseStartedAt === null || now - state.roulettePhaseStartedAt <= countdownMs) return null

let current = state
for (const playerId of state.roulettePlayerIds) {
  if (current.status !== 'roulette' || !current.roulettePlayerIds.includes(playerId)) break
  current = applyRoulettePull(current, playerId, now).state
}
return current
```

Looping over every currently-pending shooter reflects the Devil-mass-penalty
"auto-pull together" decision from section 2.

**Wiring** — `app/api/game/state/route.ts` already runs this exact
poll-driven pattern for `autoSkipIfInactive`. Add a second, sequential check
(mutually exclusive by status, since a state is never simultaneously
`'playing'`/`'challenge'` and `'roulette'`):

```ts
const advanced = await withGameLock(code, async () => {
  const fresh = await getGameState(code)
  if (!fresh) return null
  const next = autoSkipIfInactive(fresh, Date.now()) ?? autoPullIfRouletteExpired(fresh, Date.now())
  if (!next) return null
  await setGameState(next)
  return next
})
if (advanced) finalState = advanced
```

### Client: drift-free countdown rendering

New `components/TriggerTimer.tsx`:
```ts
interface TriggerTimerProps {
  phaseStartedAt: number      // gameState.roulettePhaseStartedAt from the server
  durationMs?: number          // ROULETTE_COUNTDOWN_MS
  size?: 'ring' | 'inline'
}
```

It re-derives `remainingMs = durationMs - (Date.now() - phaseStartedAt)` on
every tick (a `setInterval`/`requestAnimationFrame` loop, ~100-250ms), rather
than caching an initial "seconds left" value at mount — this avoids drift
from late mounts (Ably push delay, backgrounded tab) since it's recomputed
against the server anchor every tick. It is display-only: enforcement is
server-side (`autoPullIfRouletteExpired`), so client drift never affects the
actual outcome — the client just clamps to 0 and shows a brief "…" state
until the next poll/Ably refetch confirms the real result.

Two usage sites, one component: (a) an SVG ring around the pending shooter's
avatar in `components/PlayerSeat.tsx` — the spatial, ambient version, and the
most literal execution of "roulette motif shown spatially" — and (b) inline
above the "🔫 Pull the Trigger" button in `components/ChallengeReveal.tsx` —
the explicit, actionable version for the shooter themselves. Manual pulling
remains a normal synchronous button click exactly as today; the timer never
blocks it, it's purely an alternative path to the same outcome.

## 6. Circular seating layout

`players[]` array order is already the stable seat order today (see
`PlayersList.tsx`'s `position = index + 1` and `app/api/game/shuffle/route.ts`,
which reorders `gameState.players` during lobby to re-seat everyone) — no new
seat-index field is needed; seat math operates directly on `players.length`
and each player's index.

New pure-logic module `lib/seat-layout.ts` (kept separate from any component
so it's unit-testable in plain vitest, matching this project's convention of
testing logic in `lib/*.test.ts` without React Testing Library):

```ts
/** Rotates the array so `selfIndex` is first — seat 0 is always "me." */
export function rotateToEgocentric<T>(items: T[], selfIndex: number): T[] {
  if (selfIndex < 0) return items
  return items.map((_, i) => items[(selfIndex + i) % items.length])
}

/** Percentage-based (0-100) x/y for seat `i` of `total`, on a circle of `radiusPct` around center. */
export function computeSeatPosition(i: number, total: number, radiusPct = 42) {
  const angleDeg = 90 + (360 / total) * i   // seat 0 (me) at the bottom (90°), others fan out clockwise
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    xPct: 50 + radiusPct * Math.cos(angleRad),
    yPct: 50 + radiusPct * Math.sin(angleRad),
  }
}
```

Seats are always evenly distributed across exactly the current player count
(not a fixed 8-slot ring with empty ghost seats — "up to `MAX_PLAYERS` can
join" is a lobby-screen concept, out of scope here).

`components/RoundTable.tsx` (new, replaces `PlayersList.tsx`'s role in
`GameScreen.tsx`):
```tsx
<div className="relative aspect-square max-w-sm mx-auto">
  <PlayedPile pileCount={pileCount} tableCard={tableCard} roundNumber={roundNumber} />
  {rotateToEgocentric(players, myIndex).map((player, i) => {
    const { xPct, yPct } = computeSeatPosition(i, players.length)
    return (
      <div key={player.id} className="absolute" style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}>
        <PlayerSeat player={player} isMe={player.id === currentPlayerId} isActive={...} isPendingShooter={roulettePlayerIds.includes(player.id)} />
      </div>
    )
  })}
</div>
```

`aspect-square` plus a `max-w-sm mx-auto` cap keeps the circle geometrically
round and appropriately sized on a narrow mobile portrait viewport, with the
pile object anchored dead-center via absolute positioning.

`components/PlayerSeat.tsx` (new, extracted from `PlayersList.tsx`'s inline
`PlayerCard`) maps existing per-player info onto the compact seat footprint:
- Avatar circle + seat position number, name ("You" for self), status icon
  💀/🛡️/👑 — unchanged logic, ported as-is.
- `ChamberDots` — kept, likely needs a smaller size variant given the tighter
  circular footprint versus the old full-width list row.
- Hand-count: the old per-card stacked-square strip collapses into a single
  compact numeric badge — a visual simplification, not a functional one,
  since there's much less horizontal room per seat than a list row.
- Active-turn highlight: the existing `ring-2 ring-yellow-400` treatment,
  ported unchanged — now the primary way players track whose turn it is,
  since it moves around the circle instead of scrolling a list.
- New: a pulsing red ring (with an embedded `TriggerTimer` in ring mode) on
  any seat whose player is in `roulettePlayerIds` — the direct visual
  replacement for `ChallengeReveal`'s old "waiting for X…" text.

## 7. Card-flip reveal animation

`package.json` currently declares `"framer-motion": "^11.0.0"` but it's
imported nowhere in `components/`. Per this project's own CLAUDE.md
conventions ("Framer Motion... rebranded to `motion`... import from
`motion/react`"), swap the dependency as its own isolated first step:
```
npm uninstall framer-motion && npm install motion
```
All new animation code imports `import { motion } from 'motion/react'`.

In `components/ChallengeReveal.tsx`, replace the static bordered divs in the
"Revealed cards" section with a 3D flip built from `motion.div` + `rotateY`
(front face = rank/valid-invalid styling as today, back face = a card-back
pattern, both `[backface-visibility:hidden]`), animated
`initial={{ rotateY: 180 }} animate={{ rotateY: 0 }}` once on mount (which
coincides with `status` becoming `'roulette'`, since `GameScreen.tsx` only
mounts `ChallengeReveal` at that moment), staggered per card via
`transition={{ delay: i * 0.15 }}` so cards turn over left-to-right rather
than all at once.

The verdict banner fades in only after the flips finish
(`delay: cards.length * 0.15 + 0.3`) per the pacing decision in section 2.

## 8. Played pile as a table object

`components/PlayedPile.tsx` (new): a small stack of 2-3 layered,
slightly-rotated card-back rectangles positioned as its own object on the
table, visually distinct from `TableCard.tsx`'s face-up "declared rank"
display — one shows the round's target rank, the other is the accumulating
discard pile; they should not be stacked on each other. It carries an
always-visible small count badge (e.g. a numeric chip in a corner of the
stack) per the decision in section 2. `TableCard.tsx` loses its old
plain-text `"Round N • {pileCount} cards in pile"` line.

## 9. Test impact

- **`lib/game-logic.test.ts`**: new `describe` blocks for `applyCardPlay`
  (same cases currently only exercised via `play/route.test.ts`, plus new
  cases for a "collapsed challenge" starting state), `applyRoulettePull`, and
  `autoPullIfRouletteExpired` (mirroring the existing `autoSkipIfInactive`
  test patterns): expires and pulls a single pending shooter; expires and
  pulls every pending shooter in a Devil mass penalty; no-op before expiry;
  no-op outside `'roulette'` status; correctly chains into a round reset when
  the last pending shooter is auto-pulled; correctly chains into `'finished'`
  when auto-pull eliminates down to one alive player.
- **`app/api/game/challenge/route.test.ts`**: add `roulettePhaseStartedAt`
  assertions to the two existing "sets `status: 'roulette'`" tests
  (normal-loser and Devil-mass-penalty branches). Existing `'believe'`-action
  tests stay, per the "keep it" decision in section 2.
- **`app/api/game/play/route.test.ts`**: new describe block for "play while
  `status === 'challenge'`" — happy path (challenger plays 1-3 valid cards,
  correctly transitions to either the next challenger or straight to
  `'roulette'`), and rejection cases (non-challenger attempting to play
  during `'challenge'`, a defensively-tested safe/empty-handed challenger).
  Add a `roulettePhaseStartedAt` assertion to the existing "no eligible
  challenger → auto-roulette" test.
- **`app/api/game/roulette/route.test.ts`**: assert `roulettePhaseStartedAt`
  resets to `null` on both the round-reset and finished-game branches.
- **`app/api/game/state/route.test.ts`**: add coverage for the new
  `autoPullIfRouletteExpired` wiring, mirroring the existing
  `autoSkipIfInactive` coverage; double-check any existing `'roulette'`-status
  fixtures get a sane `roulettePhaseStartedAt` seeded so they don't
  incidentally trip the new auto-pull path in unrelated assertions.
- **New `lib/seat-layout.test.ts`**: pure math — angle correctness at various
  `total` values, egocentric rotation correctness.

## 10. Recommended implementation sequence

1. Dependency swap (`framer-motion` → `motion`) — isolated, zero behavioral risk.
2. Backend/state-machine, fully additive: `roulettePhaseStartedAt` field +
   schema defaults, `applyCardPlay`/`applyRoulettePull` extraction, extended
   `/api/game/play`, new `autoPullIfRouletteExpired`, wiring into
   `/api/game/state`. Ship with full test coverage before touching any
   component — the existing UI keeps working unmodified against this
   extended backend the whole time.
3. `lib/seat-layout.ts` + its unit tests — pure, no UI yet.
4. `PlayerSeat.tsx` + `RoundTable.tsx`, swapped into `GameScreen.tsx` in
   place of `PlayersList.tsx`.
5. `PlayedPile.tsx`, extracted out of `TableCard.tsx`.
6. Merge `ChallengeDecision.tsx` into `CardHand.tsx`, delete the former,
   update `GameScreen.tsx`'s status branch, wire the challenger-collapse
   `/api/game/play` behavior from step 2.
7. `TriggerTimer.tsx` + the flip-reveal animation in `ChallengeReveal.tsx`,
   both wired to `roulettePhaseStartedAt` from step 2.
8. Run the `verify` skill (real two-browser session) for an end-to-end pass.
