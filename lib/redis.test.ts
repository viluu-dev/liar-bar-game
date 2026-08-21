/**
 * Tests for Redis client and state management utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Redis } from '@upstash/redis'
import {
  withGameLock,
  getGameState,
  setGameState,
  projectGameView,
  checkRedisHealth,
  deleteGameState,
  LockAcquisitionError,
  RedisError
} from './redis'
import { publishGameUpdate } from './realtime'
import { GameState, Card } from './schemas'

// Mock Redis module
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  ping: vi.fn(),
}

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => mockRedis)
}))

// Mock the Ably push layer — these tests only assert that setGameState calls
// (or skips) the publish hook, not Ably's own behavior (see realtime.test.ts).
vi.mock('./realtime', () => ({
  publishGameUpdate: vi.fn(),
}))

describe('Redis Client and State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('withGameLock', () => {
    it('should acquire lock, execute function, and release lock', async () => {
      mockRedis.set.mockResolvedValueOnce('OK') // Lock acquisition
      mockRedis.del.mockResolvedValueOnce(1)    // Lock release

      const mockFn = vi.fn().mockResolvedValue('test result')

      const result = await withGameLock('ABCD', mockFn)

      expect(result).toBe('test result')
      expect(mockRedis.set).toHaveBeenCalledWith('game:lock:ABCD', '1', { nx: true, ex: 5 })
      expect(mockFn).toHaveBeenCalledOnce()
      expect(mockRedis.del).toHaveBeenCalledWith('game:lock:ABCD')
    })

    it('should use the provided code for the lock key', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')
      mockRedis.del.mockResolvedValueOnce(1)

      await withGameLock('WXYZ', vi.fn().mockResolvedValue(null))

      expect(mockRedis.set).toHaveBeenCalledWith('game:lock:WXYZ', '1', { nx: true, ex: 5 })
    })

    it('should throw LockAcquisitionError when lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValueOnce(null) // Lock acquisition failed

      const mockFn = vi.fn()

      await expect(withGameLock('ABCD', mockFn)).rejects.toThrow(LockAcquisitionError)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should release lock even if function throws', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')
      mockRedis.del.mockResolvedValueOnce(1)

      const mockFn = vi.fn().mockRejectedValue(new Error('Function error'))

      await expect(withGameLock('ABCD', mockFn)).rejects.toThrow('Function error')
      expect(mockRedis.del).toHaveBeenCalledWith('game:lock:ABCD')
    })

    it('should handle lock release failure gracefully', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')
      mockRedis.del.mockRejectedValueOnce(new Error('Delete failed'))

      const mockFn = vi.fn().mockResolvedValue('result')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await withGameLock('ABCD', mockFn)

      expect(result).toBe('result')
      expect(consoleSpy).toHaveBeenCalledWith('Failed to release game lock:', expect.any(Error))
    })
  })

  describe('getGameState', () => {
    it('should return null when state key is missing', async () => {
      mockRedis.get.mockResolvedValueOnce(null) // game:state:ABCD → null

      const result = await getGameState('ABCD')

      expect(result).toBeNull()
      expect(mockRedis.get).toHaveBeenCalledWith('game:state:ABCD')
    })

    it('should return parsed game state when valid state exists', async () => {
      const validGameState: GameState = {
        status: 'lobby',
        players: [],
        deck: [],
        tableCard: null,
        pile: [],
        pileCount: 0,
        currentPlayerIndex: -1,
        challengerIndex: null,
        lastPlay: null,
        roulettePlayerIds: [],
        roulettePhaseStartedAt: null,
        roundNumber: 1,
        winnerId: null,
        version: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        joinCode: 'ABCD',
        devilPlayerId: null,
        devilRank: null,
      }

      mockRedis.get.mockResolvedValueOnce(validGameState) // game:state:ABCD

      const result = await getGameState('ABCD')

      expect(result).toEqual(validGameState)
    })

    it('should throw RedisError for invalid game state', async () => {
      mockRedis.get.mockResolvedValueOnce({ invalid: 'state' })

      await expect(getGameState('ABCD')).rejects.toThrow(RedisError)
    })

    it('should throw RedisError on Redis operation failure', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error'))

      await expect(getGameState('ABCD')).rejects.toThrow(RedisError)
    })
  })

  describe('setGameState', () => {
    const validGameState: GameState = {
      status: 'lobby',
      players: [],
      deck: [],
      tableCard: null,
      pile: [],
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      joinCode: 'ABCD',
      devilPlayerId: null,
      devilRank: null,
    }

    it('should store valid game state with TTL under code-based key', async () => {
      mockRedis.set.mockResolvedValueOnce('OK') // game:state:ABCD

      await setGameState(validGameState)

      expect(mockRedis.set).toHaveBeenCalledWith(
        'game:state:ABCD',
        expect.objectContaining({ joinCode: 'ABCD', updatedAt: expect.any(Number) }),
        { ex: 14400 }
      )
      // Should NOT call game:active any more
      expect(mockRedis.set).toHaveBeenCalledTimes(1)
    })

    it('should throw RedisError when state has no joinCode', async () => {
      const noCode = { ...validGameState, joinCode: undefined }
      await expect(setGameState(noCode as GameState)).rejects.toThrow(RedisError)
    })

    it('should throw RedisError when Redis set operation fails', async () => {
      mockRedis.set.mockResolvedValueOnce('ERROR') // state set fails

      await expect(setGameState(validGameState)).rejects.toThrow(RedisError)
    })

    it('should throw RedisError on Redis operation failure', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('Redis error'))

      await expect(setGameState(validGameState)).rejects.toThrow(RedisError)
    })

    it('should update updatedAt timestamp', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')
      const originalUpdatedAt = validGameState.updatedAt

      await setGameState(validGameState)

      // First (and only) set call is the state
      const stateSetCall = mockRedis.set.mock.calls[0]
      expect(stateSetCall[1].updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)
    })

    it('should publish an update by default after a successful write', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')

      await setGameState(validGameState)

      expect(publishGameUpdate).toHaveBeenCalledWith('ABCD', validGameState.version)
    })

    it('should skip publish when { publish: false } is passed', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')

      await setGameState(validGameState, { publish: false })

      expect(publishGameUpdate).not.toHaveBeenCalled()
    })

    it('should not throw even if the publish hook rejects', async () => {
      mockRedis.set.mockResolvedValueOnce('OK')
      vi.mocked(publishGameUpdate).mockRejectedValueOnce(new Error('Ably unreachable'))
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(setGameState(validGameState)).resolves.toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('publishGameUpdate threw unexpectedly'),
        expect.any(Error)
      )
    })
  })

  describe('projectGameView', () => {
    const createTestGameState = (): GameState => ({
      status: 'playing',
      players: [
        {
          id: 'player1',
          name: 'Alice',
          hand: ['ACE', 'KING'] as Card[],
          isAlive: true,
          isSafe: false,
          isHost: true,
          joinedAt: Date.now(),
          lastSeenAt: Date.now(),
        },
        {
          id: 'player2',
          name: 'Bob',
          hand: ['QUEEN', 'JOKER', 'ACE'] as Card[],
          isAlive: true,
          isSafe: false,
          isHost: false,
          joinedAt: Date.now(),
          lastSeenAt: Date.now(),
        }
      ],
      deck: ['KING', 'QUEEN'] as Card[],
      tableCard: 'ACE',
      pile: ['ACE', 'KING'] as Card[],
      pileCount: 2,
      currentPlayerIndex: 0,
      challengerIndex: 1,
      lastPlay: {
        playerId: 'player1',
        playerName: 'Alice',
        cards: ['ACE', 'KING'] as Card[],
        claimedCount: 2,
        claimedCard: 'ACE',
        isDevilPlay: false,
      },
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      devilPlayerId: null,
      devilRank: null,
    })

    it('should return projected game state for requesting player', () => {
      const gameState = createTestGameState()

      const projected = projectGameView(gameState, 'player1')

      expect(projected).toEqual({
        status: 'playing',
        players: [
          {
            id: 'player1',
            name: 'Alice',
            handCount: 2,
            isAlive: true,
            isSafe: false,
            isHost: true,
            joinedAt: gameState.players[0].joinedAt,
            lastSeenAt: gameState.players[0].lastSeenAt,
          },
          {
            id: 'player2',
            name: 'Bob',
            handCount: 3,
            isAlive: true,
            isSafe: false,
            isHost: false,
            joinedAt: gameState.players[1].joinedAt,
            lastSeenAt: gameState.players[1].lastSeenAt,
          }
        ],
        myHand: ['ACE', 'KING'],
        tableCard: 'ACE',
        pileCount: 2,
        currentPlayerIndex: 0,
        challengerIndex: 1,
        lastPlay: {
          playerId: 'player1',
          playerName: 'Alice',
          claimedCount: 2,
          claimedCard: 'ACE',
          // cards field omitted
        },
        roulettePlayerIds: [],
        roulettePhaseStartedAt: null,
        myDevilRank: null,
        roundNumber: 1,
        winnerId: null,
        version: 5,
      })
    })

    it('should return empty hand for non-existent player', () => {
      const gameState = createTestGameState()

      const projected = projectGameView(gameState, 'nonexistent')

      expect(projected.myHand).toEqual([])
    })

    it('should handle null lastPlay', () => {
      const gameState = createTestGameState()
      gameState.lastPlay = null

      const projected = projectGameView(gameState, 'player1')

      expect(projected.lastPlay).toBeNull()
    })

    it('should only expose myDevilRank to the actual holder', () => {
      const gameState = createTestGameState()
      gameState.devilPlayerId = 'player1'
      gameState.devilRank = 'KING'

      expect(projectGameView(gameState, 'player1').myDevilRank).toBe('KING')
      expect(projectGameView(gameState, 'player2').myDevilRank).toBeNull()
      expect('devilPlayerId' in projectGameView(gameState, 'player1')).toBe(false)
    })

    it('should redact isDevilPlay on lastPlay until status is roulette', () => {
      const gameState = createTestGameState()
      gameState.lastPlay!.isDevilPlay = true

      const duringChallenge = projectGameView(gameState, 'player2')
      expect(duringChallenge.lastPlay).not.toHaveProperty('isDevilPlay')

      gameState.status = 'roulette'
      const duringRoulette = projectGameView(gameState, 'player2')
      expect(duringRoulette.lastPlay?.isDevilPlay).toBe(true)
    })
  })

  describe('checkRedisHealth', () => {
    it('should return true when Redis responds with PONG', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG')

      const result = await checkRedisHealth()

      expect(result).toBe(true)
      expect(mockRedis.ping).toHaveBeenCalledOnce()
    })

    it('should return false when Redis ping fails', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'))

      const result = await checkRedisHealth()

      expect(result).toBe(false)
    })

    it('should return false when Redis responds with non-PONG', async () => {
      mockRedis.ping.mockResolvedValueOnce('ERROR')

      const result = await checkRedisHealth()

      expect(result).toBe(false)
    })
  })

  describe('deleteGameState', () => {
    it('should delete only the code-keyed state', async () => {
      mockRedis.del.mockResolvedValueOnce(1) // del game:state:ABCD

      await deleteGameState('ABCD')

      expect(mockRedis.del).toHaveBeenCalledWith('game:state:ABCD')
      expect(mockRedis.del).toHaveBeenCalledTimes(1)
    })

    it('should throw RedisError on deletion failure', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Delete failed'))

      await expect(deleteGameState('ABCD')).rejects.toThrow(RedisError)
    })
  })
})
