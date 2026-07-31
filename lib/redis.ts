/**
 * Redis client and state management utilities for Liar's Bar game
 * Implements distributed locking, state persistence, and security projections
 */

import { Redis } from '@upstash/redis'
import { GameState, ProjectedGameState, GameStateSchema } from './schemas'
import { publishGameUpdate } from './realtime'

// Redis client factory function for testability
let redisInstance: Redis | null = null

function resolveRedisCredentials(): {
  url: string | undefined
  token: string | undefined
  source: 'KV_REST_API_*' | 'UPSTASH_REDIS_REST_*' | 'none'
} {
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN
  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken, source: 'KV_REST_API_*' }
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken, source: 'UPSTASH_REDIS_REST_*' }
  }

  return { url: undefined, token: undefined, source: 'none' }
}

function getRedisEnvDiagnostics() {
  const { url, token, source } = resolveRedisCredentials()

  let urlHost: string | null = null
  if (url) {
    try {
      urlHost = new URL(url).host
    } catch {
      urlHost = '(invalid URL format)'
    }
  }

  return {
    source,
    hasUrl: Boolean(url),
    hasToken: Boolean(token),
    urlHost,
    tokenLength: token?.length ?? 0,
    kvRestApiUrl: Boolean(process.env.KV_REST_API_URL),
    kvRestApiToken: Boolean(process.env.KV_REST_API_TOKEN),
    upstashRestUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    upstashRestToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
  }
}

function logRedisConnectionError(context: string, error: unknown): void {
  const errorDetails =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : { message: String(error) }

  console.error(`[redis] ${context}`, {
    ...getRedisEnvDiagnostics(),
    error: errorDetails,
  })
}

function getRedisClient(): Redis {
  if (!redisInstance) {
    const diagnostics = getRedisEnvDiagnostics()
    const { url, token, source } = resolveRedisCredentials()
    console.log('[redis] Initializing client', diagnostics)

    if (!url || !token) {
      console.error('[redis] Missing required env vars', {
        expected: 'KV_REST_API_URL + KV_REST_API_TOKEN (.env.development.local)',
        fallback: 'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN',
        KV_REST_API_URL: diagnostics.kvRestApiUrl ? 'set' : 'MISSING',
        KV_REST_API_TOKEN: diagnostics.kvRestApiToken ? 'set' : 'MISSING',
        UPSTASH_REDIS_REST_URL: diagnostics.upstashRestUrl ? 'set' : 'MISSING',
        UPSTASH_REDIS_REST_TOKEN: diagnostics.upstashRestToken ? 'set' : 'MISSING',
      })
    }

    try {
      redisInstance = new Redis({ url: url!, token: token! })
      console.log('[redis] Client created', { source, urlHost: diagnostics.urlHost })
    } catch (error) {
      logRedisConnectionError('Failed to create client', error)
      throw error
    }
  }
  return redisInstance
}

// Redis key helpers — keyed by join code
const gameStateKey = (code: string) => `game:state:${code}`
const gameLockKey  = (code: string) => `game:lock:${code}`

// TTL constants
const GAME_STATE_TTL = 14400 // 4 hours in seconds
const LOCK_TTL = 5 // 5 seconds for deadlock prevention

/**
 * Custom error for lock acquisition failures
 */
export class LockAcquisitionError extends Error {
  constructor(message: string = 'Failed to acquire game lock') {
    super(message)
    this.name = 'LockAcquisitionError'
  }
}

/**
 * Custom error for Redis operations
 */
export class RedisError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedisError'
  }
}

/**
 * Distributed lock wrapper function using SET NX EX pattern
 * Prevents concurrent write operations on game state
 *
 * @param code Join code of the game to lock on
 * @param fn Function to execute while holding the lock
 * @returns Promise resolving to the function's return value
 * @throws LockAcquisitionError if lock cannot be acquired
 */
export async function withGameLock<T>(
  code: string,
  fn: () => Promise<T>
): Promise<T> {
  const redis = getRedisClient()
  try {
    const lockKey = gameLockKey(code)

    const lockResult = await redis.set(lockKey, '1', {
      nx: true,
      ex: LOCK_TTL,
    })

    if (lockResult !== 'OK') {
      throw new LockAcquisitionError('Game is currently being modified by another player')
    }

    try {
      const result = await fn()
      return result
    } finally {
      try {
        await redis.del(lockKey)
      } catch (error) {
        console.warn('Failed to release game lock:', error)
      }
    }
  } catch (error) {
    if (error instanceof LockAcquisitionError) {
      throw error
    }
    logRedisConnectionError(`Lock operation failed (code=${code})`, error)
    throw new RedisError(`Lock operation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Retrieve and validate game state from Redis
 *
 * @param code Join code of the game to retrieve
 * @returns Promise resolving to GameState or null if no game exists
 * @throws RedisError if state exists but is invalid
 */
export async function getGameState(code: string): Promise<GameState | null> {
  const redis = getRedisClient()
  try {
    const stateJson = await redis.get(gameStateKey(code))

    if (stateJson === null) {
      return null
    }

    const parseResult = GameStateSchema.safeParse(stateJson)

    if (!parseResult.success) {
      console.error('Invalid game state in Redis:', parseResult.error.issues)
      throw new RedisError('Corrupted game state detected')
    }

    return parseResult.data
  } catch (error) {
    if (error instanceof RedisError) {
      throw error
    }
    logRedisConnectionError(`getGameState failed (code=${code})`, error)
    throw new RedisError(`Failed to retrieve game state: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Store game state in Redis with TTL management
 *
 * @param state Complete game state to store
 * @param options.publish Whether to broadcast a push update after the write (default true).
 *   Pass `false` for writes that aren't a real state change other players need to see
 *   (e.g. a heartbeat-only lastSeenAt bump) — publishing on those would create a
 *   poll→publish→refetch→poll feedback loop.
 * @throws RedisError if storage operation fails
 */
export async function setGameState(
  state: GameState,
  options?: { publish?: boolean }
): Promise<void> {
  const redis = getRedisClient()
  let validatedState: GameState
  let code: string

  try {
    validatedState = GameStateSchema.parse(state)
    validatedState.updatedAt = Date.now()

    const parsedCode = validatedState.joinCode
    if (!parsedCode) throw new RedisError('Game state must have joinCode to persist')
    code = parsedCode

    const result = await redis.set(gameStateKey(code), validatedState, {
      ex: GAME_STATE_TTL,
    })

    if (result !== 'OK') {
      throw new RedisError('Failed to store game state')
    }
  } catch (error) {
    if (error instanceof RedisError) {
      throw error
    }
    logRedisConnectionError(`setGameState failed (code=${state.joinCode ?? 'unknown'})`, error)
    throw new RedisError(`Failed to store game state: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Isolated from the write's error handling above: the Redis write already
  // succeeded, so a publish failure — even one that violates publishGameUpdate's
  // own "never throws" contract — must never surface as a RedisError here.
  if (options?.publish !== false) {
    try {
      await publishGameUpdate(code, validatedState.version)
    } catch (error) {
      console.warn(`[redis] publishGameUpdate threw unexpectedly (code=${code})`, error)
    }
  }
}

/**
 * Project game state for client consumption, stripping private data
 *
 * @param state Complete server-side game state
 * @param playerId ID of the requesting player
 * @returns ProjectedGameState safe for client consumption
 */
export function projectGameView(
  state: GameState,
  playerId: string
): ProjectedGameState {
  // Find the requesting player
  const requestingPlayer = state.players.find(p => p.id === playerId)

  // Project all players — expose chamberIndex (not chamber array)
  const projectedPlayers = state.players.map(player => ({
    id: player.id,
    name: player.name,
    handCount: player.hand.length,
    isAlive: player.isAlive,
    isSafe: player.isSafe,
    isHost: player.isHost,
    joinedAt: player.joinedAt,
    lastSeenAt: player.lastSeenAt,
    ...(player.chamberIndex !== undefined && { chamberIndex: player.chamberIndex }),
  }))

  // Reveal actual cards (and whether it was a Devil play) only during
  // roulette (challenge resolved, cards exposed to all) — revealing
  // isDevilPlay any earlier would tell the challenger a challenge is
  // guaranteed to fail before they decide, which is information they never
  // had access to under the old, unrevealed-until-played Devil Card.
  let projectedLastPlay = null
  if (state.lastPlay) {
    projectedLastPlay = {
      playerId: state.lastPlay.playerId,
      playerName: state.lastPlay.playerName,
      claimedCount: state.lastPlay.claimedCount,
      claimedCard: state.lastPlay.claimedCard,
      ...(state.status === 'roulette' && { cards: state.lastPlay.cards, isDevilPlay: state.lastPlay.isDevilPlay }),
    }
  }

  return {
    status: state.status,
    players: projectedPlayers,
    myHand: requestingPlayer?.hand ?? [], // Only expose requesting player's hand
    tableCard: state.tableCard,
    pileCount: state.pileCount,
    currentPlayerIndex: state.currentPlayerIndex,
    challengerIndex: state.challengerIndex,
    lastPlay: projectedLastPlay,
    roulettePlayerIds: state.roulettePlayerIds,
    roulettePhaseStartedAt: state.roulettePhaseStartedAt,
    myDevilRank: state.devilPlayerId === playerId ? state.devilRank : null,
    roundNumber: state.roundNumber,
    winnerId: state.winnerId,
    version: state.version,
    ...(state.joinCode !== undefined && { joinCode: state.joinCode }),
    ...(state.settings !== undefined && { settings: state.settings }),
    ...(state.rematchPlayerIds !== undefined && { rematchPlayerIds: state.rematchPlayerIds }),
  }
}

/**
 * Check if Redis connection is healthy
 *
 * @returns Promise resolving to true if Redis is accessible
 */
export async function checkRedisHealth(): Promise<boolean> {
  const startedAt = Date.now()
  const diagnostics = getRedisEnvDiagnostics()

  console.log('[redis] Health check starting', diagnostics)

  if (!diagnostics.hasUrl || !diagnostics.hasToken) {
    console.error('[redis] Health check skipped — env not configured', {
      source: diagnostics.source,
      KV_REST_API_URL: diagnostics.kvRestApiUrl ? 'set' : 'MISSING',
      KV_REST_API_TOKEN: diagnostics.kvRestApiToken ? 'set' : 'MISSING',
      UPSTASH_REDIS_REST_URL: diagnostics.upstashRestUrl ? 'set' : 'MISSING',
      UPSTASH_REDIS_REST_TOKEN: diagnostics.upstashRestToken ? 'set' : 'MISSING',
    })
    return false
  }

  try {
    const redis = getRedisClient()
    const result = await redis.ping()
    const ok = result === 'PONG'
    console.log('[redis] Health check complete', {
      ok,
      result,
      elapsedMs: Date.now() - startedAt,
      urlHost: diagnostics.urlHost,
    })
    return ok
  } catch (error) {
    logRedisConnectionError('Health check failed', error)
    console.error('[redis] Health check timing', { elapsedMs: Date.now() - startedAt })
    return false
  }
}

/**
 * Delete game state (for cleanup/testing)
 *
 * @param code Join code of the game to delete
 */
export async function deleteGameState(code: string): Promise<void> {
  try {
    const redis = getRedisClient()
    await redis.del(gameStateKey(code))
  } catch (error) {
    throw new RedisError(`Failed to delete game state: ${error instanceof Error ? error.message : String(error)}`)
  }
}
