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

describe('/api/game/challenge', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  const PLAYER_A = '550e8400-e29b-41d4-a716-446655440000' // played cards
  const PLAYER_B = '550e8400-e29b-41d4-a716-446655440001' // challenger (index 1)
  const PLAYER_C = '550e8400-e29b-41d4-a716-446655440002'

  beforeEach(() => {
    vi.clearAllMocks()
    mockWithGameLock.mockImplementation(async (_code, fn) => fn())
    mockSetGameState.mockResolvedValue()
  })

  const makeRequest = (body: unknown): NextRequest =>
    ({ json: async () => body }) as NextRequest

  const makeState = (overrides: Partial<GameState> = {}): GameState => ({
    status: 'challenge',
    players: [
      { id: PLAYER_A, name: 'Alice', hand: ['ACE', 'KING'], isAlive: true, isSafe: false, isHost: true,  joinedAt: 1000, lastSeenAt: 1000 },
      { id: PLAYER_B, name: 'Bob',   hand: ['QUEEN', 'ACE'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 1001 },
      { id: PLAYER_C, name: 'Carol', hand: ['KING', 'JOKER'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1002, lastSeenAt: 1002 },
    ],
    deck: [],
    tableCard: 'KING',
    pile: ['ACE', 'KING'],
    pileCount: 2,
    currentPlayerIndex: 0,
    challengerIndex: 1,
    lastPlay: {
      playerId: PLAYER_A,
      playerName: 'Alice',
      cards: ['ACE', 'KING'],
      claimedCount: 2,
      claimedCard: 'KING',
      isDevilPlay: false,
    },
    roulettePlayerIds: [],
    roulettePhaseStartedAt: null,
    roundNumber: 1,
    winnerId: null,
    version: 5,
    createdAt: 1000,
    updatedAt: 1000,
    devilPlayerId: null,
    devilRank: null,
    ...overrides,
  })

  describe('believe', () => {
    it('transitions to playing, challenger becomes current player', async () => {
      mockGetGameState.mockResolvedValue(makeState())

      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.gameVersion).toBe(6)

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          currentPlayerIndex: 1, // challenger index
          challengerIndex: null,
          lastPlay: null,
          version: 6,
        })
      )
    })

    it('clears lastPlay on believe', async () => {
      mockGetGameState.mockResolvedValue(makeState())
      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ lastPlay: null })
      )
    })

    it('skips safe challenger — advances to next non-safe alive player', async () => {
      const state = makeState()
      // Make Bob (challenger, index 1) safe
      state.players[1].isSafe = true
      // Carol (index 2) is the next non-safe alive player
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ currentPlayerIndex: 2 })
      )
    })

    it('falls back to challenger index when all alive players are safe', async () => {
      const state = makeState()
      // All alive players safe → no non-safe player found
      state.players[0].isSafe = true
      state.players[1].isSafe = true
      state.players[2].isSafe = true
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))

      // Falls back to challengerIndex (1 = Bob)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ currentPlayerIndex: 1 })
      )
    })
  })

  describe('liar — honest play (challenger loses)', () => {
    it('sets roulettePlayerIds to challenger when play was honest', async () => {
      // All cards in lastPlay match tableCard or are Jokers → honest
      const state = makeState()
      state.lastPlay!.cards = ['KING', 'KING'] // both match tableCard 'KING'
      mockGetGameState.mockResolvedValue(state)

      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [PLAYER_B], // challenger loses
          challengerIndex: null,
          roulettePhaseStartedAt: expect.any(Number),
        })
      )
    })

    it('treats Jokers as valid wildcards', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['KING', 'JOKER'] // JOKER counts as valid
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [PLAYER_B], // challenger loses (was honest)
        })
      )
    })
  })

  describe('liar — dishonest play (player who played loses)', () => {
    it('sets roulettePlayerIds to the player who lied', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['ACE', 'KING'] // ACE doesn't match tableCard 'KING' → lie
      mockGetGameState.mockResolvedValue(state)

      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [PLAYER_A], // Alice played and lied
          challengerIndex: null,
        })
      )
    })
  })

  describe('liar — Devil Card mass penalty', () => {
    it('sets roulettePlayerIds to every other alive player, not just the challenger', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['KING']
      state.lastPlay!.isDevilPlay = true
      mockGetGameState.mockResolvedValue(state)

      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))

      expect(res.status).toBe(200)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [PLAYER_B, PLAYER_C],
          challengerIndex: null,
          roulettePhaseStartedAt: expect.any(Number),
        })
      )
    })

    it('excludes already-eliminated players from the mass penalty', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['KING']
      state.lastPlay!.isDevilPlay = true
      state.players[2].isAlive = false // Carol already eliminated
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ roulettePlayerIds: [PLAYER_B] })
      )
    })

    it('never marks the Devil player themselves as needing to pull', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['KING']
      state.lastPlay!.isDevilPlay = true
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))

      const updatedState = mockSetGameState.mock.calls[0][0] as GameState
      expect(updatedState.roulettePlayerIds).not.toContain(PLAYER_A)
    })

    it('does not trigger the mass penalty for a normal (non-invoked) play of the flagged rank', async () => {
      const state = makeState()
      state.lastPlay!.cards = ['KING', 'KING'] // honest, matches tableCard, isDevilPlay stays false
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'liar' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ roulettePlayerIds: [PLAYER_B] })
      )
    })
  })

  describe('validation errors', () => {
    it('rejects missing playerId', async () => {
      const res = await POST(makeRequest({ action: 'believe' }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid action', async () => {
      const res = await POST(makeRequest({ playerId: PLAYER_B, action: 'maybe' }))
      expect(res.status).toBe(400)
    })

    it('rejects when game not in challenge phase', async () => {
      mockGetGameState.mockResolvedValue(makeState({ status: 'playing' }))
      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Game is not in challenge phase')
    })

    it('rejects non-challenger player', async () => {
      mockGetGameState.mockResolvedValue(makeState())
      const res = await POST(makeRequest({ playerId: PLAYER_C, joinCode: 'TEST', action: 'believe' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Only the designated challenger can respond')
    })

    it('rejects when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)
      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('No active game session found')
    })

    it('rejects eliminated challenger', async () => {
      const state = makeState()
      state.players[1].isAlive = false
      mockGetGameState.mockResolvedValue(state)
      const res = await POST(makeRequest({ playerId: PLAYER_B, joinCode: 'TEST', action: 'believe' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Eliminated players cannot challenge')
    })
  })
})
