/**
 * Test suite for /api/game/shuffle route
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'
import { getGameState, setGameState, deleteGameState, withGameLock } from '@/lib/redis'
import type { GameState } from '@/lib/types'

// Mock the Redis functions
vi.mock('@/lib/redis', () => ({
  getGameState: vi.fn(),
  setGameState: vi.fn(),
  deleteGameState: vi.fn(),
  withGameLock: vi.fn()
}))

vi.mock('@/lib/game-logic', () => ({
  shuffleArray: vi.fn((items) => [...items].reverse()),
}))

describe('/api/game/shuffle', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockDeleteGameState = vi.mocked(deleteGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  const HOST_UUID = '550e8400-e29b-41d4-a716-446655440000'
  const PLAYER2_UUID = '550e8400-e29b-41d4-a716-446655440001'
  const PLAYER3_UUID = '550e8400-e29b-41d4-a716-446655440002'
  const UNKNOWN_UUID = '550e8400-e29b-41d4-a716-999999999999'

  beforeEach(() => {
    vi.clearAllMocks()

    mockWithGameLock.mockImplementation(async (_code, fn) => {
      return await fn()
    })
  })

  afterEach(async () => {
    try {
      await mockDeleteGameState('TEST')
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  const createMockRequest = (body: any): NextRequest => {
    return {
      json: async () => body,
    } as NextRequest
  }

  const createTestGameState = (overrides: Partial<GameState> = {}): GameState => ({
    status: 'lobby',
    players: [
      {
        id: HOST_UUID,
        name: 'Host Player',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: 1000,
        lastSeenAt: 1000
      },
      {
        id: PLAYER2_UUID,
        name: 'Player 2',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: false,
        joinedAt: 1001,
        lastSeenAt: 1001
      },
      {
        id: PLAYER3_UUID,
        name: 'Player 3',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: false,
        joinedAt: 1002,
        lastSeenAt: 1002
      }
    ],
    deck: [],
    tableCard: null,
    pile: [],
    pileCount: 0,
    currentPlayerIndex: -1,
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerIds: [],
    roundNumber: 1,
    winnerId: null,
    version: 5,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  })

  describe('Success cases', () => {
    it('should shuffle player order when host makes request', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)
      mockSetGameState.mockResolvedValue()

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.gameVersion).toBe(6)

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: [
            expect.objectContaining({ id: PLAYER3_UUID }),
            expect.objectContaining({ id: PLAYER2_UUID }),
            expect.objectContaining({ id: HOST_UUID })
          ],
          version: 6
        })
      )
    })

    it('should preserve each player isHost flag through the shuffle', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)
      mockSetGameState.mockResolvedValue()

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      await POST(request)

      const updatedState = mockSetGameState.mock.calls[0][0] as GameState
      const host = updatedState.players.find(p => p.id === HOST_UUID)
      expect(host?.isHost).toBe(true)
    })
  })

  describe('Validation errors', () => {
    it('should reject request with invalid playerId', async () => {
      const request = createMockRequest({
        playerId: 'not-a-uuid'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toContain('playerId is required and must be a valid UUID')
    })
  })

  describe('Game state errors', () => {
    it('should reject when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('No active game session found')
    })

    it('should reject when game is not in lobby status', async () => {
      const gameState = createTestGameState({ status: 'playing' })
      mockGetGameState.mockResolvedValue(gameState)

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Can only shuffle seating during lobby phase')
    })

    it('should reject when player is not in game', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)

      const request = createMockRequest({
        playerId: UNKNOWN_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Player not found in current game session')
    })

    it('should reject when non-host tries to shuffle', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)

      const request = createMockRequest({
        playerId: PLAYER2_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Only the host can shuffle seating')
    })
  })
})
