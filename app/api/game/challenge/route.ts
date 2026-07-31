import { NextRequest, NextResponse } from 'next/server'
import { ChallengeRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { resolveChallenge, getNextAlivePlayerIndex } from '@/lib/game-logic'
import type { GameActionResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = ChallengeRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId and action ("believe" | "liar") are required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode, action } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'challenge') {
        throw new Error('Game is not in challenge phase')
      }

      if (gameState.challengerIndex === null) {
        throw new Error('No challenger set for this challenge')
      }

      const challenger = gameState.players[gameState.challengerIndex]
      if (challenger.id !== playerId) {
        throw new Error('Only the designated challenger can respond')
      }

      if (!challenger.isAlive) {
        throw new Error('Eliminated players cannot challenge')
      }

      if (action === 'believe') {
        // Challenger believes — they play next, unless they're safe (hand empty).
        // Safe players are skipped for playing; find the next non-safe alive player.
        const nextPlayerIndex = challenger.isSafe
          ? (getNextAlivePlayerIndex(gameState.players, gameState.challengerIndex, true) ?? gameState.challengerIndex)
          : gameState.challengerIndex

        const updatedGameState = {
          ...gameState,
          status: 'playing' as const,
          currentPlayerIndex: nextPlayerIndex,
          challengerIndex: null,
          lastPlay: null,
          players: gameState.players.map((p, i) =>
            i === gameState.challengerIndex ? { ...p, lastSeenAt: Date.now() } : p
          ),
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }

        await setGameState(updatedGameState)
        return updatedGameState.version
      }

      // action === 'liar'
      if (!gameState.lastPlay) {
        throw new Error('No last play to challenge')
      }

      if (!gameState.tableCard) {
        throw new Error('No table card set')
      }

      // Devil Card: always a valid wildcard, so the challenge fails outright —
      // but instead of the normal single-loser outcome, every OTHER alive
      // player (safe or not) must face the revolver (docs/devil.card.md).
      const isDevilPlay = gameState.lastPlay.isDevilPlay

      if (isDevilPlay) {
        const devilPlayerId = gameState.lastPlay.playerId
        const roulettePlayerIds = gameState.players
          .filter(p => p.isAlive && p.id !== devilPlayerId)
          .map(p => p.id)

        const updatedGameState = {
          ...gameState,
          status: 'roulette' as const,
          roulettePlayerIds,
          roulettePhaseStartedAt: Date.now(),
          challengerIndex: null,
          players: gameState.players.map((p, i) =>
            i === gameState.challengerIndex ? { ...p, lastSeenAt: Date.now() } : p
          ),
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }

        await setGameState(updatedGameState)
        return updatedGameState.version
      }

      const { isValid } = resolveChallenge(gameState.lastPlay.cards, gameState.tableCard)

      // honest play (isValid) → challenger called liar incorrectly → challenger loses
      // dishonest play → the player who lied loses
      const loserPlayerId = isValid
        ? challenger.id
        : gameState.lastPlay.playerId

      const updatedGameState = {
        ...gameState,
        status: 'roulette' as const,
        roulettePlayerIds: [loserPlayerId],
        roulettePhaseStartedAt: Date.now(),
        challengerIndex: null,
        players: gameState.players.map((p, i) =>
          i === gameState.challengerIndex ? { ...p, lastSeenAt: Date.now() } : p
        ),
        version: gameState.version + 1,
        updatedAt: Date.now(),
      }

      await setGameState(updatedGameState)
      return updatedGameState.version
    })

    const response: GameActionResponse = { success: true, gameVersion: result }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Challenge error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to process challenge'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
