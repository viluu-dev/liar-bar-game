---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest) |
| **Config file** | `vitest.config.mts` — Wave 0 installs |
| **Quick run command** | `npx vitest run src/lib/__tests__/schemas.test.ts src/lib/__tests__/game-state.test.ts` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds (unit); ~10 seconds (with integration) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/lib/__tests__/schemas.test.ts src/lib/__tests__/game-state.test.ts` (unit only, no network)
- **After each wave:** `npx vitest run --reporter=verbose` (full suite including integration)
- **Phase gate:** All tests green before verify-work

---

## Success Criteria → Test Map

Phase 1 has no formal REQ-IDs (pure infrastructure). Success criteria map directly to tests:

| SC | Behavior | Test Type | Command | File |
|----|----------|-----------|---------|------|
| SC-1: Write/read round-trip | `setGameState()` then `getGameState()` returns typed object | integration | `npx vitest run src/lib/__tests__/redis.integration.ts` | Wave 1 |
| SC-2: Lock prevents concurrent write | Second `withGameLock()` while first holds → throws `LockError` | unit (mocked Redis) | `npx vitest run src/lib/__tests__/game-state.test.ts` | Wave 1 |
| SC-3: `projectGameView` strips hands | Caller receives `handCount` not `hand` for others; own hand present | unit | `npx vitest run src/lib/__tests__/game-state.test.ts` | Wave 1 |
| SC-4: Zod rejects malformed payload | `GameStateSchema.parse(badData)` throws `ZodError` | unit | `npx vitest run src/lib/__tests__/schemas.test.ts` | Wave 1 |

---

## Wave 0 Gaps (must exist before Wave 1 tasks run)

- [ ] `vitest.config.mts` — Vitest config with `vite-tsconfig-paths`
- [ ] Vitest devDependencies installed: `vitest @vitejs/plugin-react vite-tsconfig-paths jsdom`
- [ ] Test file stubs: `src/lib/__tests__/schemas.test.ts`, `src/lib/__tests__/game-state.test.ts`, `src/lib/__tests__/redis.integration.ts`
