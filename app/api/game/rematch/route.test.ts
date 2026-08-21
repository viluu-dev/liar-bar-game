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

describe('/api/game/rematch', () => {
  const mockGetGameState = vi.mocked(getGameState)
  const mockSetGameState = vi.mocked(setGameState)
  const mockWithGameLock = vi.mocked(withGameLock)

  const HOST_UUID    = '550e8400-e29b-41d4-a716-446655440000'
  const PLAYER2_UUID = '550e8400-e29b-41d4-a716-446655440001'
  const PLAYER3_UUID = '550e8400-e29b-41d4-a716-446655440002'
  const OUTSIDER_UUID = '550e8400-e29b-41d4-a716-446655440099'

  beforeEach(() => {
    vi.clearAllMocks()
    mockWithGameLock.mockImplementation(async (_code, fn) => fn())
    mockSetGameState.mockResolvedValue()
  })

  const makeRequest = (body: unknown): NextRequest =>
    ({ json: async () => body }) as NextRequest

  const makeFinishedState = (overrides: Partial<GameState> = {}): GameState => ({
    status: 'finished',
    players: [
      { id: HOST_UUID,    name: 'Alice', hand: [], isAlive: false, isSafe: false, isHost: true,  joinedAt: 1000, lastSeenAt: 2000 },
      { id: PLAYER2_UUID, name: 'Bob',   hand: [], isAlive: true,  isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 2001 },
      { id: PLAYER3_UUID, name: 'Carol', hand: [], isAlive: false, isSafe: false, isHost: false, joinedAt: 1002, lastSeenAt: 2002 },
    ],
    deck: [],
    tableCard: 'ACE',
    pile: ['KING'],
    pileCount: 1,
    currentPlayerIndex: 1,
    challengerIndex: null,
    lastPlay: { playerId: HOST_UUID, playerName: 'Alice', cards: ['KING'], claimedCount: 1, claimedCard: 'ACE', isDevilPlay: false },
    roulettePlayerIds: [HOST_UUID],
    roulettePhaseStartedAt: null,
    roundNumber: 3,
    winnerId: PLAYER2_UUID,
    version: 20,
    createdAt: 1000,
    updatedAt: 2000,
    joinCode: 'ABCD',
    settings: { bullets: 1 },
    devilPlayerId: null,
    devilRank: null,
    ...overrides,
  })

  const makeLobbyState = (overrides: Partial<GameState> = {}): GameState => ({
    status: 'lobby',
    players: [
      { id: HOST_UUID,    name: 'Alice', hand: [], isAlive: false, isSafe: false, isHost: true,  joinedAt: 1000, lastSeenAt: 2000 },
      { id: PLAYER2_UUID, name: 'Bob',   hand: [], isAlive: true,  isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 2001 },
      { id: PLAYER3_UUID, name: 'Carol', hand: [], isAlive: false, isSafe: false, isHost: false, joinedAt: 1002, lastSeenAt: 2002 },
    ],
    deck: [],
    tableCard: null,
    pile: [],
    pileCount: 0,
    currentPlayerIndex: -1,
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerIds: [],
    roulettePhaseStartedAt: null,
    roundNumber: 3,
    winnerId: null,
    version: 21,
    createdAt: 1000,
    updatedAt: 3000,
    joinCode: 'ABCD',
    settings: { bullets: 1 },
    rematchPlayerIds: [HOST_UUID],
    devilPlayerId: null,
    devilRank: null,
    ...overrides,
  })

  describe('first click — finished → lobby transition', () => {
    it('returns 200 with success and incremented version', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.gameVersion).toBe(21)
    })

    it('transitions status to lobby', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'lobby' })
      )
    })

    it('keeps all original players in the game', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID }),
            expect.objectContaining({ id: PLAYER2_UUID }),
            expect.objectContaining({ id: PLAYER3_UUID }),
          ]),
        })
      )
    })

    it('resets all player hands to empty', async () => {
      const state = makeFinishedState({
        players: [
          { id: HOST_UUID, name: 'Alice', hand: ['ACE', 'KING'], isAlive: false, isSafe: true, isHost: true, joinedAt: 1000, lastSeenAt: 2000 },
          { id: PLAYER2_UUID, name: 'Bob', hand: ['QUEEN'], isAlive: true, isSafe: false, isHost: false, joinedAt: 1001, lastSeenAt: 2001 },
        ],
      })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID, hand: [] }),
            expect.objectContaining({ id: PLAYER2_UUID, hand: [] }),
          ]),
        })
      )
    })

    it('keeps original host as host when original host clicks', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID, isHost: true }),
            expect.objectContaining({ id: PLAYER2_UUID, isHost: false }),
          ]),
        })
      )
    })

    it('keeps original host as host when a non-host clicks first', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      // Bob (non-host) clicks first
      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID, isHost: true }),
            expect.objectContaining({ id: PLAYER2_UUID, isHost: false }),
          ]),
        })
      )
    })

    it('clears game-in-progress fields', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          deck: [],
          pile: [],
          pileCount: 0,
          tableCard: null,
          lastPlay: null,
          challengerIndex: null,
          roulettePlayerIds: [],
          winnerId: null,
          currentPlayerIndex: -1,
        })
      )
    })

    it('keeps joinCode, settings, and roundNumber', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          joinCode: 'ABCD',
          settings: { bullets: 1 },
          roundNumber: 3,
        })
      )
    })

    it('resets rematchPlayerIds to empty on lobby transition', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          rematchPlayerIds: [],
        })
      )
    })

    it('resets isSafe for all players', async () => {
      const state = makeFinishedState({
        players: [
          { id: HOST_UUID, name: 'Alice', hand: [], isAlive: false, isSafe: true, isHost: true, joinedAt: 1000, lastSeenAt: 2000 },
          { id: PLAYER2_UUID, name: 'Bob', hand: [], isAlive: true, isSafe: true, isHost: false, joinedAt: 1001, lastSeenAt: 2001 },
        ],
      })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          players: expect.arrayContaining([
            expect.objectContaining({ id: HOST_UUID, isSafe: false }),
            expect.objectContaining({ id: PLAYER2_UUID, isSafe: false }),
          ]),
        })
      )
    })
  })

  describe('subsequent click — finished state with existing rematchPlayerIds', () => {
    it('adds player to rematchPlayerIds without changing status', async () => {
      const state = makeFinishedState({ rematchPlayerIds: [HOST_UUID] })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'finished',
          rematchPlayerIds: expect.arrayContaining([HOST_UUID, PLAYER2_UUID]),
        })
      )
    })

    it('host re-clicking still creates lobby (host click always transitions)', async () => {
      const state = makeFinishedState({ rematchPlayerIds: [HOST_UUID] })
      mockGetGameState.mockResolvedValue(state)
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(body.success).toBe(true)
      // Host always creates lobby — setGameState should be called
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'lobby' })
      )
    })

    it('increments version on new rematch entry', async () => {
      const state = makeFinishedState({ rematchPlayerIds: [HOST_UUID] })
      mockGetGameState.mockResolvedValue(state)
      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ version: state.version + 1 })
      )
    })
  })

  describe('lobby click — adding to existing lobby', () => {
    it('adds player to rematchPlayerIds in lobby state', async () => {
      mockGetGameState.mockResolvedValue(makeLobbyState())
      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'lobby',
          rematchPlayerIds: expect.arrayContaining([HOST_UUID, PLAYER2_UUID]),
        })
      )
    })

    it('does not change status when already in lobby', async () => {
      mockGetGameState.mockResolvedValue(makeLobbyState())
      await POST(makeRequest({ playerId: PLAYER2_UUID, joinCode: 'ABCD' }))
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'lobby' })
      )
    })

    it('is idempotent when player already in rematchPlayerIds', async () => {
      mockGetGameState.mockResolvedValue(makeLobbyState())
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(mockSetGameState).not.toHaveBeenCalled()
    })
  })

  describe('error cases', () => {
    it('rejects invalid request body (missing playerId)', async () => {
      const res = await POST(makeRequest({ joinCode: 'ABCD' }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid request body (missing joinCode)', async () => {
      const res = await POST(makeRequest({ playerId: HOST_UUID }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when game is in playing state', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState({ status: 'playing' }))
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Game is not in finished or lobby state')
    })

    it('returns 400 when game is in challenge state', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState({ status: 'challenge' }))
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when player is not in game', async () => {
      mockGetGameState.mockResolvedValue(makeFinishedState())
      const res = await POST(makeRequest({ playerId: OUTSIDER_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('Player not found in current game session')
    })

    it('returns 400 when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)
      const res = await POST(makeRequest({ playerId: HOST_UUID, joinCode: 'ABCD' }))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.error).toBe('No active game session found')
    })
  })
})
