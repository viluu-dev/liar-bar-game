/**
 * Shared game-wide constants.
 * Dependency-free so it can be imported from server routes, Zod schemas,
 * game logic, and client components alike.
 */

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

// Visible UI pacing timer for the roulette countdown — distinct from the 90s
// silent AFK threshold used by autoSkipIfInactive: that value silently detects
// a genuinely abandoned player across a multi-minute game, while this one is
// a dramatic, always-visible pacing device that needs to be short enough to
// keep momentum.
export const ROULETTE_COUNTDOWN_MS = 10_000
