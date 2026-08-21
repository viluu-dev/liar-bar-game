/**
 * Tests for game state polling endpoint
 * Verifies version-based change detection, security projections, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { getGameState, setGameState, projectGameView, withGameLock } from '@/lib/redis'
import type { GameState, Player } from '@/lib/types'

// Mock Redis functions
vi.mock('@/lib/redis', () => ({
  getGameState: vi.fn(),
  setGameState: vi.fn(),
  projectGameView: vi.fn(),
  withGameLock: vi.fn(),
}))

const mockedGetGameState = vi.mocked(getGameState)
const mockedSetGameState = vi.mocked(setGameState)
const mockedProjectGameView = vi.mocked(projectGameView)
const mockedWithGameLock = vi.mocked(withGameLock)

describe('/api/game/state GET', () => {
  const playerId = '123e4567-e89b-12d3-a456-426614174000'
  const code = 'TEST'

  beforeEach(() => {
    vi.clearAllMocks()
    // withGameLock no-ops by default (auto-skip path)
    mockedWithGameLock.mockImplementation(async (_code, fn) => fn())
  })

  it('should return error for missing playerId', async () => {
    const request = new NextRequest(`http://localhost/api/game/state?code=${code}`)

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('playerId is required')
  })

  it('should return error for missing code', async () => {
    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}`)

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('playerId is required')
  })

  it('should return error for invalid playerId format', async () => {
    const request = new NextRequest(`http://localhost/api/game/state?playerId=invalid-uuid&code=${code}`)

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('valid UUID')
  })

  it('should return phase:none when no game exists', async () => {
    mockedGetGameState.mockResolvedValue(null)

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)

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
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      devilPlayerId: null,
      devilRank: null
    }

    mockedGetGameState.mockResolvedValue(mockGameState)

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}&since=5`)

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
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      devilPlayerId: null,
      devilRank: null
    }

    mockedGetGameState.mockResolvedValue(mockGameState)

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)

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
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 3,
      createdAt: now,
      updatedAt: now,
      devilPlayerId: null,
      devilRank: null
    }

    const mockProjectedState = {
      status: 'lobby' as const,
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
      myHand: ['ACE', 'KING'] as ('ACE' | 'KING' | 'QUEEN' | 'JOKER')[],
      tableCard: null,
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 4,
      myDevilRank: null
    }

    mockedGetGameState.mockResolvedValue(mockGameState)
    mockedSetGameState.mockResolvedValue()
    mockedProjectGameView.mockReturnValue(mockProjectedState)

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}&since=2`)

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
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      devilPlayerId: null,
      devilRank: null
    }

    const mockProjectedState = {
      status: 'lobby' as const,
      players: [],
      myHand: [],
      tableCard: null,
      pileCount: 0,
      currentPlayerIndex: -1,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      roundNumber: 1,
      winnerId: null,
      version: 3,
      myDevilRank: null
    }

    mockedGetGameState.mockResolvedValue(mockGameState)
    mockedSetGameState.mockRejectedValue(new Error('Redis error'))
    mockedProjectGameView.mockReturnValue(mockProjectedState)

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)

    const response = await GET(request)
    const data = await response.json()

    // Should still return projected state even if timestamp update fails
    expect(response.status).toBe(200)
    expect(data.gameState).toEqual(mockProjectedState)
  })

  it('should handle getGameState errors', async () => {
    mockedGetGameState.mockRejectedValue(new Error('Redis connection failed'))

    const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to retrieve game state')
  })

  describe('autoPullIfRouletteExpired wiring', () => {
    const OTHER_ID = '223e4567-e89b-12d3-a456-426614174001'

    const makeRouletteState = (roulettePhaseStartedAt: number): GameState => {
      const now = Date.now()
      return {
        status: 'roulette',
        players: [
          { id: playerId, name: 'Shooter', hand: [], isAlive: true, isSafe: false, isHost: true, joinedAt: now - 10_000, lastSeenAt: now - 1000, chamber: [false, false, false, false, false, false], chamberIndex: 0 },
          { id: OTHER_ID, name: 'Other', hand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'] as Player['hand'], isAlive: true, isSafe: false, isHost: false, joinedAt: now - 9000, lastSeenAt: now - 500 },
        ],
        deck: [],
        tableCard: 'ACE',
        pile: ['KING'],
        pileCount: 1,
        currentPlayerIndex: 0,
        challengerIndex: null,
        lastPlay: { playerId: OTHER_ID, playerName: 'Other', cards: ['KING'], claimedCount: 1, claimedCard: 'ACE', isDevilPlay: false },
        roulettePlayerIds: [playerId],
        roulettePhaseStartedAt,
        roundNumber: 2,
        winnerId: null,
        version: 8,
        createdAt: now - 20_000,
        updatedAt: now - 20_000,
        devilPlayerId: null,
        devilRank: null,
        settings: { bullets: 1 },
      }
    }

    it('auto-pulls the pending shooter once the countdown has expired', async () => {
      // ROULETTE_COUNTDOWN_MS is 10s — 11s ago is expired
      const rouletteState = makeRouletteState(Date.now() - 11_000)
      mockedGetGameState.mockResolvedValue(rouletteState)
      mockedSetGameState.mockResolvedValue()
      mockedProjectGameView.mockReturnValue({
        status: 'playing', players: [], myHand: [], tableCard: null, pileCount: 0,
        currentPlayerIndex: -1, challengerIndex: null, lastPlay: null, roulettePlayerIds: [],
        roulettePhaseStartedAt: null, roundNumber: 1, winnerId: null, version: 1, myDevilRank: null,
      })

      const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)
      await GET(request)

      // One write for the lastSeenAt heartbeat, one for the auto-pull's real mutation
      expect(mockedSetGameState).toHaveBeenCalledTimes(2)
      const autoPulledState = mockedSetGameState.mock.calls[1][0] as GameState
      expect(autoPulledState.roulettePlayerIds).not.toContain(playerId)
      expect(mockedProjectGameView).toHaveBeenCalledWith(autoPulledState, playerId)
    })

    it('does not auto-pull before the countdown expires', async () => {
      const rouletteState = makeRouletteState(Date.now() - 1000) // well within the 10s window
      mockedGetGameState.mockResolvedValue(rouletteState)
      mockedSetGameState.mockResolvedValue()
      mockedProjectGameView.mockReturnValue({
        status: 'roulette', players: [], myHand: [], tableCard: null, pileCount: 0,
        currentPlayerIndex: -1, challengerIndex: null, lastPlay: null, roulettePlayerIds: [playerId],
        roulettePhaseStartedAt: rouletteState.roulettePhaseStartedAt, roundNumber: 2, winnerId: null,
        version: 9, myDevilRank: null,
      })

      const request = new NextRequest(`http://localhost/api/game/state?playerId=${playerId}&code=${code}`)
      await GET(request)

      // Only the lastSeenAt heartbeat write — no auto-pull mutation
      expect(mockedSetGameState).toHaveBeenCalledTimes(1)
    })
  })
})
