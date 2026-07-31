/**
 * Test suite for /api/game/start route
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
  createDeckForPlayerCount: vi.fn(() => [
    'ACE', 'ACE', 'ACE', 'ACE', 'ACE', 'ACE',
    'KING', 'KING', 'KING', 'KING', 'KING', 'KING',
    'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN',
    'JOKER', 'JOKER'
  ]),
  shuffleDeck: vi.fn((deck) => [...deck]),
  dealCards: vi.fn(() => ({
    playerHands: [
      ['ACE', 'ACE', 'KING', 'KING', 'QUEEN'],
      ['ACE', 'ACE', 'KING', 'KING', 'QUEEN']
    ],
    remainingDeck: ['ACE', 'ACE', 'KING', 'KING', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN', 'JOKER', 'JOKER']
  })),
  selectTableCard: vi.fn(() => 'ACE'),
  initChamber: vi.fn(() => [false, false, false, false, false, false]),
  selectDevilCard: vi.fn(() => ({ handIndex: 0, rank: 'KING' })),
}))

describe('/api/game/start', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockDeleteGameState = vi.mocked(deleteGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  // UUIDs to use in tests
  const HOST_UUID = '550e8400-e29b-41d4-a716-446655440000'
  const PLAYER2_UUID = '550e8400-e29b-41d4-a716-446655440001'
  const PLAYER3_UUID = '550e8400-e29b-41d4-a716-446655440002'
  const UNKNOWN_UUID = '550e8400-e29b-41d4-a716-999999999999'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock withGameLock to simply execute the function
    mockWithGameLock.mockImplementation(async (_code, fn) => {
      return await fn()
    })
  })

  afterEach(async () => {
    // Clean up any test game state
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
    devilPlayerId: null,
    devilRank: null,
    ...overrides
  })

  describe('Success cases', () => {
    it('should start a game successfully when host makes request', async () => {
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
      expect(result.gameVersion).toBe(6) // version incremented

      // Verify setGameState was called with updated state
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          players: expect.arrayContaining([
            expect.objectContaining({
              id: HOST_UUID,
              hand: ['ACE', 'ACE', 'KING', 'KING', 'QUEEN']
            }),
            expect.objectContaining({
              id: PLAYER2_UUID, 
              hand: ['ACE', 'ACE', 'KING', 'KING', 'QUEEN']
            })
          ]),
          tableCard: 'ACE',
          currentPlayerIndex: 0,
          version: 6
        })
      )
    })

    it('should deal cards correctly to all players', async () => {
      const gameState = createTestGameState({
        players: [
          ...createTestGameState().players,
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
        ]
      })
      mockGetGameState.mockResolvedValue(gameState)
      mockSetGameState.mockResolvedValue()

      // Mock dealCards for 3 players
      const { dealCards } = await import('@/lib/game-logic')
      vi.mocked(dealCards).mockReturnValue({
        playerHands: [
          ['ACE', 'ACE', 'KING', 'KING', 'QUEEN'],
          ['ACE', 'ACE', 'KING', 'KING', 'QUEEN'],
          ['ACE', 'KING', 'KING', 'QUEEN', 'QUEEN']
        ],
        remainingDeck: ['ACE', 'QUEEN', 'QUEEN', 'JOKER', 'JOKER']
      })

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      await POST(request)

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({
              id: HOST_UUID,
              hand: expect.arrayContaining(['ACE', 'ACE', 'KING', 'KING', 'QUEEN'])
            }),
            expect.objectContaining({
              id: PLAYER2_UUID,
              hand: expect.arrayContaining(['ACE', 'ACE', 'KING', 'KING', 'QUEEN'])
            }),
            expect.objectContaining({
              id: PLAYER3_UUID,
              hand: expect.arrayContaining(['ACE', 'KING', 'KING', 'QUEEN', 'QUEEN'])
            })
          ])
        })
      )
    })

    it('should set table card and initialize turn order', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)
      mockSetGameState.mockResolvedValue()

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      await POST(request)

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          tableCard: 'ACE',
          currentPlayerIndex: 0,
          challengerIndex: null,
          pile: [],
          pileCount: 0,
          lastPlay: null
        })
      )
    })
  })

  describe('Devil Card assignment', () => {
    it('leaves devilPlayerId/devilRank null when devilMode is off (default)', async () => {
      mockGetGameState.mockResolvedValue(createTestGameState())
      mockSetGameState.mockResolvedValue()

      await POST(createMockRequest({ playerId: HOST_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ devilPlayerId: null, devilRank: null })
      )
    })

    it('flags the selected hand/rank as this round\'s Devil Card when devilMode is on', async () => {
      mockGetGameState.mockResolvedValue(createTestGameState())
      mockSetGameState.mockResolvedValue()

      await POST(createMockRequest({ playerId: HOST_UUID, joinCode: 'TEST', devilMode: true }))

      // The mocked selectDevilCard returns { handIndex: 0, rank: 'KING' },
      // and dealResult.playerHands[0] maps to gameState.players[0] (HOST_UUID).
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ devilPlayerId: HOST_UUID, devilRank: 'KING' })
      )
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

    it('should reject request with missing playerId', async () => {
      const request = createMockRequest({})

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
      expect(result.error).toBe('Game has already started or is in progress')
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

    it('should reject when non-host tries to start game', async () => {
      const gameState = createTestGameState()
      mockGetGameState.mockResolvedValue(gameState)

      const request = createMockRequest({
        playerId: PLAYER2_UUID, // Not the host
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Only the host can start the game')
    })

    it('should reject when only one player in lobby', async () => {
      const gameState = createTestGameState({
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
          }
        ]
      })
      mockGetGameState.mockResolvedValue(gameState)

      const request = createMockRequest({
        playerId: HOST_UUID,
        joinCode: 'TEST'
      })

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('At least 2 players are required to start the game')
    })
  })
})