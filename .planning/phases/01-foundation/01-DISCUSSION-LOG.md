# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 1-Foundation
**Mode:** Autonomous (auto-selected — pure infrastructure phase, stack predetermined by CLAUDE.md)
**Areas discussed:** GameState schema, Lock strategy, View projection, Zod scope, File structure

---

## GameState Schema

| Option | Description | Selected |
|--------|-------------|----------|
| String unions for card types | `'ACE' \| 'KING' \| 'QUEEN' \| 'JOKER'` — simple, serializable | ✓ |
| Object types for cards | `{ suit: 'table', rank: 'ACE' }` — more extensible but overkill for this deck | |

**Decision:** String union enums — simple, Zod-friendly, Redis-safe serialization
**Notes:** Auto-selected. 20-card fixed deck with 4 values needs no runtime behavior on card objects.

---

## Lock Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast (423 Locked) | No retry — client polls naturally at 2s | ✓ |
| Retry with backoff | Up to 3 retries in route handler | |
| Queue writes | More complex, unnecessary for this scale | |

**Decision:** Fail fast with `LockError` → 423 HTTP status
**Notes:** Auto-selected. SWR polling at 2s means the client retries automatically. Retry logic in the server adds complexity for no practical benefit.

---

## View Projection Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Strip hands + deck + pile | Most secure — clients never receive others' cards | ✓ |
| Strip hands only | Deck/pile could leak round state | |

**Decision:** Strip `deck`, `pile`, `lastPlay.cards` + replace other players' `hand` with `handCount`
**Notes:** Auto-selected per ROADMAP.md success criteria #3: "caller cannot receive another player's cards."

---

## Zod Schema Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Full GameState schema | Validates entire state on every read — strongest guarantee | ✓ |
| Boundary-only schemas | Only validate incoming API payloads | |

**Decision:** Full GameState schema (hierarchical: PlayerSchema, LastPlaySchema, GameStateSchema)
**Notes:** Auto-selected. ROADMAP.md success criterion #4 requires Zod rejection of malformed payloads. Full schema also protects against Redis corruption.

---

## File Structure

| Option | Description | Selected |
|--------|-------------|----------|
| `src/types/` + `src/lib/` split | Types separate from implementation | ✓ |
| Single `src/lib/game.ts` monolith | All in one file | |
| `src/game/` feature folder | Feature-based grouping | |

**Decision:** `src/types/game.ts` + `src/lib/redis.ts` + `src/lib/schemas.ts` + `src/lib/game-state.ts`
**Notes:** Auto-selected. Next.js 15 App Router convention. Split types from schemas so route handlers can import types without pulling in Zod runtime.

---

## Claude's Discretion

- Exact error message strings in `LockError`
- Whether to export card values as `const` objects alongside type unions (decided: include both)
- Test file location (decided: `src/lib/__tests__/` co-located)

## Deferred Ideas

- Zod refinements for game rule invariants (hand size limits, etc.) — Phase 3 if needed
- Redis pipeline for optimistic concurrency — overkill for this scale
