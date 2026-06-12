/**
 * Redis client and state management utilities for Liar's Bar game
 * Implements distributed locking, state persistence, and security projections
 */

import { Redis } from '@upstash/redis'
import { GameState, ProjectedGameState, GameStateSchema } from './schemas'

// Redis client factory function for testability
let redisInstance: Redis | null = null

function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
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
    throw new RedisError(`Failed to retrieve game state: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Store game state in Redis with TTL management
 *
 * @param state Complete game state to store
 * @throws RedisError if storage operation fails
 */
export async function setGameState(state: GameState): Promise<void> {
  const redis = getRedisClient()
  try {
    const validatedState = GameStateSchema.parse(state)
    validatedState.updatedAt = Date.now()

    const code = validatedState.joinCode
    if (!code) throw new RedisError('Game state must have joinCode to persist')

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
    throw new RedisError(`Failed to store game state: ${error instanceof Error ? error.message : String(error)}`)
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

  // Project all players to remove private data
  const projectedPlayers = state.players.map(player => ({
    id: player.id,
    name: player.name,
    handCount: player.hand.length,
    isAlive: player.isAlive,
    isSafe: player.isSafe,
    isHost: player.isHost,
    joinedAt: player.joinedAt,
    lastSeenAt: player.lastSeenAt,
  }))

  // Reveal actual cards only during roulette (challenge resolved, cards exposed to all)
  let projectedLastPlay = null
  if (state.lastPlay) {
    projectedLastPlay = {
      playerId: state.lastPlay.playerId,
      playerName: state.lastPlay.playerName,
      claimedCount: state.lastPlay.claimedCount,
      claimedCard: state.lastPlay.claimedCard,
      ...(state.status === 'roulette' && { cards: state.lastPlay.cards }),
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
    roulettePlayerId: state.roulettePlayerId,
    roundNumber: state.roundNumber,
    winnerId: state.winnerId,
    version: state.version,
    ...(state.joinCode !== undefined && { joinCode: state.joinCode }),
    ...(state.settings !== undefined && { settings: state.settings }),
    // chamberIndex exposed (not chamber — that would reveal bullet position)
    ...(state.chamberIndex !== undefined && { chamberIndex: state.chamberIndex }),
    ...(state.rematchPlayerIds !== undefined && { rematchPlayerIds: state.rematchPlayerIds }),
  }
}

/**
 * Check if Redis connection is healthy
 *
 * @returns Promise resolving to true if Redis is accessible
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedisClient()
    const result = await redis.ping()
    return result === 'PONG'
  } catch (error) {
    console.error('Redis health check failed:', error)
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
