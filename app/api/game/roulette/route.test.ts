import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import type { GameState } from '@/lib/types'

vi.mock('@/lib/redis', () => ({
  getGameState: vi.fn(),
  setGameState: vi.fn(),
  withGameLock: vi.fn(),
}))

vi.mock('@/lib/game-logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/game-logic')>()
  return {
    ...actual,
    selectTableCard: vi.fn(() => 'KING' as const),
  }
})

describe('/api/game/roulette', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  const LOSER_UUID  = '550e8400-e29b-41d4-a716-446655440000'
  const PLAYER2_UUID = '550e8400-e29b-41d4-a716-446655440001'
  const OTHER_UUID  = '550e8400-e29b-41d4-a716-446655440002'

  beforeEach(() => {
    vi.clearAllMocks()
    mockWithGameLock.mockImplementation(async (_code, fn) => fn())
    mockSetGameState.mockResolvedValue()
  })

  const makeRequest = (body: unknown): NextRequest =>
    ({ json: async () => body }) as NextRequest

  // Default loser player: safe chamber (no bullet at index 0)
  const SAFE_CHAMBER = [false, false, false, false, false, false] as [boolean,boolean,boolean,boolean,boolean,boolean]
  const HIT_CHAMBER  = [true,  false, false, false, false, false] as [boolean,boolean,boolean,boolean,boolean,boolean]

  const makeLoser = (chamberOverride = SAFE_CHAMBER) =>
    ({ id: LOSER_UUID, name: 'Alice', hand: ['ACE','KING','QUEEN','JOKER','ACE'] as import('@/lib/types').Card[], isAlive: true, isSafe: false, isHost: true, joinedAt: 1000, lastSeenAt: 1000, chamber: chamberOverride, chamberIndex: 0 })

  const makeState = (overrides: Partial<GameState> = {}, chamberOverride = SAFE_CHAMBER): GameState => ({
    status: 'roulette',
    players: [
      makeLoser(chamberOverride),
      { id: PLAYER2_UUID, name: 'Bob', hand: ['KING','KING','QUEEN','ACE','JOKER'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 1001 },
    ],
    deck: [],
    tableCard: 'ACE',
    pile: ['KING', 'ACE'],
    pileCount: 2,
    currentPlayerIndex: 0,
    challengerIndex: null,
    lastPlay: { playerId: PLAYER2_UUID, playerName: 'Bob', cards: ['KING'], claimedCount: 1, claimedCard: 'ACE' },
    roulettePlayerId: LOSER_UUID,
    roundNumber: 2,
    winnerId: null,
    version: 8,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  })

  describe('safe outcome (chamber not hit)', () => {
    it('returns safe result and resets round', async () => {
      mockGetGameState.mockResolvedValue(makeState())

      const res = await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.result).toBe('safe')
      expect(body.gameVersion).toBe(9)
    })

    it('resets to playing status with new round', async () => {
      mockGetGameState.mockResolvedValue(makeState())
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          pile: [],
          pileCount: 0,
          lastPlay: null,
          roulettePlayerId: null,
          roundNumber: 3,
          challengerIndex: null,
        })
      )
    })

    it('deals new hands to all alive players', async () => {
      mockGetGameState.mockResolvedValue(makeState())
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: LOSER_UUID,   hand: expect.arrayContaining([expect.any(String)]) }),
            expect.objectContaining({ id: PLAYER2_UUID, hand: expect.arrayContaining([expect.any(String)]) }),
          ]),
        })
      )
    })

    it('resets isSafe for all players', async () => {
      const state = makeState()
      state.players[0].isSafe = true
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: LOSER_UUID, isSafe: false }),
          ]),
        })
      )
    })
  })

  describe('eliminated outcome (chamber hit)', () => {
    // Use HIT_CHAMBER so index 0 has the bullet → eliminated
    const eliminatedState = (overrides: Partial<GameState> = {}) =>
      makeState(overrides, HIT_CHAMBER)

    it('returns eliminated result', async () => {
      mockGetGameState.mockResolvedValue(eliminatedState())
      const res = await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      const body = await res.json()
      expect(body.result).toBe('eliminated')
    })

    it('marks player as dead and resets round', async () => {
      // Need 3 players so 2 survive after elimination (otherwise game ends)
      const state = makeState({
        players: [
          makeLoser(HIT_CHAMBER),
          { id: PLAYER2_UUID, name: 'Bob',   hand: ['KING','KING','QUEEN','ACE','JOKER'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 1001 },
          { id: OTHER_UUID,   name: 'Carol', hand: ['ACE','ACE','KING','QUEEN','JOKER'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1002, lastSeenAt: 1002 },
        ],
      })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          players: expect.arrayContaining([
            expect.objectContaining({ id: LOSER_UUID, isAlive: false }),
            expect.objectContaining({ id: PLAYER2_UUID, isAlive: true }),
          ]),
        })
      )
    })

    it('sets finished status and winner when last player eliminated', async () => {
      const state = makeState({
        players: [makeLoser(HIT_CHAMBER)],
      })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'finished',
          winnerId: null,
        })
      )
    })

    it('sets winner when one player survives', async () => {
      mockGetGameState.mockResolvedValue(eliminatedState())
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'finished',
          winnerId: PLAYER2_UUID,
        })
      )
    })
  })

  describe('validation errors', () => {
    it('rejects missing playerId', async () => {
      const res = await POST(makeRequest({}))
      expect(res.status).toBe(400)
    })

    it('rejects when game not in roulette phase', async () => {
      mockGetGameState.mockResolvedValue(makeState({ status: 'playing' }))
      const res = await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Game is not in roulette phase')
    })

    it('rejects non-loser player', async () => {
      mockGetGameState.mockResolvedValue(makeState())
      const res = await POST(makeRequest({ playerId: OTHER_UUID, joinCode: 'TEST' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Only the challenge loser can pull the trigger')
    })

    it('rejects when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)
      const res = await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      expect(res.status).toBe(400)
    })
  })
})
