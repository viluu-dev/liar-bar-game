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
    lastPlay: { playerId: PLAYER2_UUID, playerName: 'Bob', cards: ['KING'], claimedCount: 1, claimedCard: 'ACE', isDevilPlay: false },
    roulettePlayerIds: [LOSER_UUID],
    roulettePhaseStartedAt: null,
    roundNumber: 2,
    winnerId: null,
    version: 8,
    createdAt: 1000,
    updatedAt: 1000,
    devilPlayerId: null,
    devilRank: null,
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
          roulettePlayerIds: [],
          roulettePhaseStartedAt: null,
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

    it('leaves devilPlayerId/devilRank null on round reset when no Devil Card was ever assigned', async () => {
      mockGetGameState.mockResolvedValue(makeState({ settings: { bullets: 1, devilMode: false } }))
      await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ devilPlayerId: null, devilRank: null })
      )
    })

    it('re-rolls the Devil Card assignment from the new hands on round reset', async () => {
      // The Devil Card is re-rolled every round reset — the previous round's
      // assignment (here, Bob/PLAYER2_UUID) is discarded even though it was
      // never played. selectDevilCard/selectTableCard are called from inside
      // applyRoulettePull (same module), so mocking them via vi.mock would
      // not intercept those internal calls — crypto.getRandomValues is
      // controlled directly instead, exactly like the deterministic-shuffle
      // tests in lib/game-logic.test.ts. With every draw forced to 0, dealing
      // to 2 alive players deterministically picks handIndex 0 (Alice,
      // LOSER_UUID), rank ACE — see lib/game-logic.ts's shuffleArray/
      // selectDevilCard for how this specific outcome arises.
      const originalGetRandomValues = global.crypto.getRandomValues
      global.crypto.getRandomValues = ((arr: Uint32Array) => { arr[0] = 0; return arr }) as typeof global.crypto.getRandomValues

      mockGetGameState.mockResolvedValue(makeState({
        settings: { bullets: 1, devilMode: true },
        devilPlayerId: PLAYER2_UUID,
        devilRank: 'KING',
      }))

      try {
        await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      } finally {
        global.crypto.getRandomValues = originalGetRandomValues
      }

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({ devilPlayerId: LOSER_UUID, devilRank: 'ACE' })
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
          roulettePhaseStartedAt: null,
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

  describe('Devil Card mass penalty', () => {
    const DEVIL_UUID = '550e8400-e29b-41d4-a716-446655440010'
    const SHOOTER1_UUID = '550e8400-e29b-41d4-a716-446655440011'
    const SHOOTER2_UUID = '550e8400-e29b-41d4-a716-446655440012'

    const makeShooter = (id: string, name: string, chamberOverride = SAFE_CHAMBER) => ({
      id, name, hand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'] as import('@/lib/types').Card[],
      isAlive: true, isSafe: false, isHost: false, joinedAt: 1000, lastSeenAt: 1000,
      chamber: chamberOverride, chamberIndex: 0,
    })

    const makeDevilState = (overrides: Partial<GameState> = {}): GameState => ({
      status: 'roulette',
      players: [
        { id: DEVIL_UUID, name: 'Dana', hand: [], isAlive: true, isSafe: false, isHost: true, joinedAt: 999, lastSeenAt: 999 },
        makeShooter(SHOOTER1_UUID, 'Shooter1'),
        makeShooter(SHOOTER2_UUID, 'Shooter2'),
      ],
      deck: [],
      tableCard: 'ACE',
      pile: ['KING'],
      pileCount: 1,
      currentPlayerIndex: 0,
      challengerIndex: null,
      lastPlay: { playerId: DEVIL_UUID, playerName: 'Dana', cards: ['KING'], claimedCount: 1, claimedCard: 'ACE', isDevilPlay: true },
      roulettePlayerIds: [SHOOTER1_UUID, SHOOTER2_UUID],
      roulettePhaseStartedAt: null,
      roundNumber: 2,
      winnerId: null,
      version: 8,
      createdAt: 1000,
      updatedAt: 1000,
      // The Devil Card's ability is spent the moment it was played (see play/route.ts).
      devilPlayerId: null,
      devilRank: null,
      ...overrides,
    })

    it('drains the pending queue one pull at a time without resetting the round early', async () => {
      mockGetGameState.mockResolvedValue(makeDevilState())

      const res = await POST(makeRequest({ playerId: SHOOTER1_UUID, joinCode: 'TEST' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.result).toBe('safe')
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'roulette',
          roulettePlayerIds: [SHOOTER2_UUID],
          roundNumber: 2, // unchanged — no round reset yet, Shooter2 still pending
        })
      )
    })

    it('resets the round once the last pending shooter pulls, starting the next round with the Devil player', async () => {
      const state = makeDevilState({ roulettePlayerIds: [SHOOTER2_UUID] }) // Shooter1 already resolved
      mockGetGameState.mockResolvedValue(state)

      await POST(makeRequest({ playerId: SHOOTER2_UUID, joinCode: 'TEST' }))

      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          roulettePlayerIds: [],
          currentPlayerIndex: 0, // Dana, the Devil player, starts the next round
          roundNumber: 3,
        })
      )
    })

    it('ends the game immediately when the last pending shooter is eliminated, even mid Devil-round', async () => {
      const state = makeDevilState({
        players: [
          { id: DEVIL_UUID, name: 'Dana', hand: [], isAlive: true, isSafe: false, isHost: true, joinedAt: 999, lastSeenAt: 999 },
          { ...makeShooter(SHOOTER1_UUID, 'Shooter1'), isAlive: false }, // already eliminated earlier this round
          makeShooter(SHOOTER2_UUID, 'Shooter2', HIT_CHAMBER),
        ],
        roulettePlayerIds: [SHOOTER2_UUID],
      })
      mockGetGameState.mockResolvedValue(state)

      const res = await POST(makeRequest({ playerId: SHOOTER2_UUID, joinCode: 'TEST' }))
      const body = await res.json()

      expect(body.result).toBe('eliminated')
      expect(mockSetGameState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'finished',
          roulettePlayerIds: [],
          winnerId: DEVIL_UUID,
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
      expect(body.error).toBe('Only a designated shooter can pull the trigger')
    })

    it('rejects when no game exists', async () => {
      mockGetGameState.mockResolvedValue(null)
      const res = await POST(makeRequest({ playerId: LOSER_UUID, joinCode: 'TEST' }))
      expect(res.status).toBe(400)
    })
  })
})
