/**
 * Tests for game state polling endpoint
 * Verifies version-based change detection, security projections, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { getGameState, setGameState, projectGameView } from '@/lib/redis'
import type { GameState, Player } from '@/lib/types'

// Mock Redis functions
vi.mock('@/lib/redis', () => ({
  getGameState: vi.fn(),
  setGameState: vi.fn(),
  projectGameView: vi.fn()
}))

const mockedGetGameState = vi.mocked(getGameState)
const mockedSetGameState = vi.mocked(setGameState)
const mockedProjectGameView = vi.mocked(projectGameView)

describe('/api/game/state GET', () => {
  const playerId = '123e4567-e89b-12d3-a456-426614174000'
  
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return error for missing playerId', async () => {
    const request = new NextRequest('http://localhost/api/game/state')
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.error).toContain('playerId is required')
  })

  it('should return error for invalid playerId format', async () => {
    const request = new NextRequest('http://localhost/api/game/state?playerId=invalid-uuid')
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.error).toContain('valid UUID')
  })

  it('should return phase:none when no game exists', async () => {
    mockedGetGameState.mockResolvedValue(null)
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}`)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data).toEqual({
      version: 0,
      changed: false,
      phase: "none"
    })
  })

  it('should return changed:false when version matches since parameter', async () => {
    const mockGameState: GameState = {
      status: 'lobby',
      players: [{
        id: playerId,
        name: 'Test Player',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      } as Player],
      deck: [],
      tableCard: null,
      pile: [],
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 5,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    mockedGetGameState.mockResolvedValue(mockGameState)
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&since=5`)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data).toEqual({
      version: 5,
      changed: false
    })
  })

  it('should return error when player not found in game', async () => {
    const mockGameState: GameState = {
      status: 'lobby',
      players: [{
        id: 'different-player-id',
        name: 'Other Player',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      } as Player],
      deck: [],
      tableCard: null,
      pile: [],
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 5,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    mockedGetGameState.mockResolvedValue(mockGameState)
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}`)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(404)
    expect(data.error).toContain('Player not found')
  })

  it('should return projected game state when player exists and version changed', async () => {
    const now = Date.now()
    const mockGameState: GameState = {
      status: 'lobby',
      players: [{
        id: playerId,
        name: 'Test Player',
        hand: ['ACE', 'KING'],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: now,
        lastSeenAt: now - 1000
      } as Player],
      deck: ['QUEEN', 'JOKER'],
      tableCard: null,
      pile: [],
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 3,
      createdAt: now,
      updatedAt: now
    }
    
    const mockProjectedState = {
      status: 'lobby',
      players: [{
        id: playerId,
        name: 'Test Player',
        handCount: 2,
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: now,
        lastSeenAt: now
      }],
      myHand: ['ACE', 'KING'],
      tableCard: null,
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 4
    }
    
    mockedGetGameState.mockResolvedValue(mockGameState)
    mockedSetGameState.mockResolvedValue()
    mockedProjectGameView.mockReturnValue(mockProjectedState)
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&since=2`)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.changed).toBe(true)
    expect(data.version).toBe(4)
    expect(data.gameState).toEqual(mockProjectedState)
    
    // Verify that projectGameView was called with updated state
    expect(mockedProjectGameView).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 4,
        players: expect.arrayContaining([
          expect.objectContaining({
            id: playerId,
            lastSeenAt: expect.any(Number)
          })
        ])
      }),
      playerId
    )
  })

  it('should handle setGameState failure gracefully', async () => {
    const mockGameState: GameState = {
      status: 'lobby',
      players: [{
        id: playerId,
        name: 'Test Player',
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      } as Player],
      deck: [],
      tableCard: null,
      pile: [],
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 3,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    const mockProjectedState = {
      status: 'lobby',
      players: [],
      myHand: [],
      tableCard: null,
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerId: null,
      roundNumber: 1,
      winnerId: null,
      version: 3
    }
    
    mockedGetGameState.mockResolvedValue(mockGameState)
    mockedSetGameState.mockRejectedValue(new Error('Redis error'))
    mockedProjectGameView.mockReturnValue(mockProjectedState)
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}`)
    
    const response = await GET(request)
    const data = await response.json()
    
    // Should still return projected state even if timestamp update fails
    expect(response.status).toBe(200)
    expect(data.gameState).toEqual(mockProjectedState)
  })

  it('should handle getGameState errors', async () => {
    mockedGetGameState.mockRejectedValue(new Error('Redis connection failed'))
    
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}`)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to retrieve game state')
  })
})