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

describe('/api/game/play', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  const HOST_UUID   = '550e8400-e29b-41d4-a716-446655440000'
  const PLAYER2_UUID = '550e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
    mockWithGameLock.mockImplementation(async (_code, fn) => fn())
  })

  const makeRequest = (body: unknown): NextRequest =>
    ({ json: async () => body }) as NextRequest

  const makeGameState = (overrides: Partial<GameState> = {}): GameState => ({
    status: 'playing',
    players: [
      {
        id: HOST_UUID,
        name: 'Alice',
        hand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: 1000,
        lastSeenAt: 1000,
      },
      {
        id: PLAYER2_UUID,
        name: 'Bob',
        hand: ['KING', 'KING', 'QUEEN', 'ACE', 'JOKER'],
        isAlive: true,
        isSafe: false,
        isHost: false,
        joinedAt: 1001,
        lastSeenAt: 1001,
      },
    ],
    deck: [],
    tableCard: 'KING',
    pile: [],
    pileCount: 0,
    currentPlayerIndex: 0,
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerIds: [],
    roundNumber: 1,
    winnerId: null,
    version: 3,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  })

  describe('Success cases', () => {
    it('plays 1 card, transitions to challenge, sets challengerIndex', async () => {
      mockGetGameState.mockResolvedValue(makeGameState())
      mockSetGameState.mockResolvedValue()

      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.gameVersion).toBe(4)

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'challenge',
          challengerIndex: 1,
          pileCount: 1,
          version: 4,
          lastPlay: expect.objectContaining({
            playerId: HOST_UUID,
            playerName: 'Alice',
            claimedCount: 1,
            claimedCard: 'KING',
            cards: ['ACE'],
          }),
        })
      )
    })

    it('plays 3 cards, removes all from hand', async () => {
      mockGetGameState.mockResolvedValue(makeGameState())
      mockSetGameState.mockResolvedValue()

      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0, 1, 2], declaredCard: 'ACE' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({
              id: HOST_UUID,
              hand: ['JOKER', 'ACE'],
            }),
          ]),
          pileCount: 3,
        })
      )
    })

    it('marks player safe when hand is emptied', async () => {
      const state = makeGameState()
      state.players[0].hand = ['ACE']
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'ACE' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID, hand: [], isSafe: true }),
          ]),
        })
      )
    })

    it('adds played cards to existing pile', async () => {
      const state = makeGameState({ pile: ['KING'], pileCount: 1 })
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ pileCount: 2 })
      )
    })

    it('wraps around turn order to find challenger', async () => {
      const state = makeGameState({ currentPlayerIndex: 1 })
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ challengerIndex: 0 })
      )
    })

    it('skips safe players when finding challenger', async () => {
      const state = makeGameState()
      state.players[1].isSafe = true // Bob is safe — should be skipped
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      // Only 2 players; Bob is safe → no eligible challenger → auto-roulette
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [HOST_UUID],
          challengerIndex: null,
        })
      )
    })

    it('auto-routes to roulette when all other alive players are safe', async () => {
      const state = makeGameState()
      state.players[1].isSafe = true
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'roulette', roulettePlayerIds: [HOST_UUID] })
      )
    })
  })

  describe('Validation errors', () => {
    it('rejects missing playerId', async () => {
      const res = await POST(makeRequest({ cardIndices: [0], declaredCard: 'KING' }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid UUID', async () => {
      const res = await POST(makeRequest({ playerId: 'bad', cardIndices: [0], declaredCard: 'KING' }))
      expect(res.status).toBe(400)
    })

    it('rejects empty cardIndices', async () => {
      const res = await POST(makeRequest({ playerId: HOST_UUID, cardIndices: [], declaredCard: 'KING' }))
      expect(res.status).toBe(400)
    })

    it('rejects more than 3 cardIndices', async () => {
      const res = await POST(makeRequest({ playerId: HOST_UUID, cardIndices: [0, 1, 2, 3], declaredCard: 'KING' }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid declaredCard (JOKER not allowed)', async () => {
      const res = await POST(makeRequest({ playerId: HOST_UUID, cardIndices: [0], declaredCard: 'JOKER' }))
      expect(res.status).toBe(400)
    })
  })

  describe('Devil Card', () => {
    it('rejects playing the Devil Card combined with other cards', async () => {
      const state = makeGameState()
      state.players[0].hand = ['DEVIL', 'KING', 'QUEEN', 'JOKER', 'ACE']
      mockGetGameState.mockResolvedValue(state)

      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0, 1], declaredCard: 'KING' }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('The Devil Card must be played alone')
      expect(mockSetGameState).not.toHaveBeenCalled()
    })

    it('allows playing the Devil Card alone', async () => {
      const state = makeGameState()
      state.players[0].hand = ['DEVIL', 'KING', 'QUEEN', 'JOKER', 'ACE']
      mockGetGameState.mockResolvedValue(state)
      mockSetGameState.mockResolvedValue()

      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))

      expect(res.status).toBe(200)
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'challenge',
          lastPlay: expect.objectContaining({ cards: ['DEVIL'], claimedCard: 'KING' }),
        })
      )
    })
  })

  describe('Game state errors', () => {
    it('rejects when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('No active game session found')
    })

    it('rejects when game is not in playing phase', async () => {
      mockGetGameState.mockResolvedValue(makeGameState({ status: 'challenge' }))
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Game is not in playing phase')
    })

    it('rejects when not player turn', async () => {
      mockGetGameState.mockResolvedValue(makeGameState())
      const res = await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('It is not your turn')
    })

    it('rejects eliminated player', async () => {
      const state = makeGameState()
      state.players[0].isAlive = false
      mockGetGameState.mockResolvedValue(state)
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Eliminated players cannot play cards')
    })

    it('rejects out-of-range card index', async () => {
      const state = makeGameState()
      state.players[0].hand = ['ACE', 'KING']
      mockGetGameState.mockResolvedValue(state)
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [3], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toContain('out of range')
    })

    it('rejects duplicate card indices', async () => {
      mockGetGameState.mockResolvedValue(makeGameState())
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'TEST', cardIndices: [0, 0], declaredCard: 'KING' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Duplicate card indices are not allowed')
    })
  })
})
