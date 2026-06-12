import { NextRequest, NextResponse } from 'next/server'
import { PlayCardsRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { getNextAlivePlayerIndex } from '@/lib/game-logic'
import type { GameActionResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = PlayCardsRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId, cardIndices (1-3), and declaredCard are required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode, cardIndices, declaredCard } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'playing') {
        throw new Error('Game is not in playing phase')
      }

      const playerIndex = gameState.players.findIndex(p => p.id === playerId)
      if (playerIndex === -1) {
        throw new Error('Player not found in current game session')
      }

      const player = gameState.players[playerIndex]

      if (!player.isAlive) {
        throw new Error('Eliminated players cannot play cards')
      }

      if (playerIndex !== gameState.currentPlayerIndex) {
        throw new Error('It is not your turn')
      }

      // Validate no duplicate indices
      const uniqueIndices = new Set(cardIndices)
      if (uniqueIndices.size !== cardIndices.length) {
        throw new Error('Duplicate card indices are not allowed')
      }

      // Validate indices are within hand bounds
      for (const idx of cardIndices) {
        if (idx >= player.hand.length) {
          throw new Error(`Card index ${idx} is out of range for hand of ${player.hand.length}`)
        }
      }

      // Remove selected cards from hand
      const playedCards = cardIndices.map(i => player.hand[i])
      const newHand = player.hand.filter((_, i) => !cardIndices.includes(i))
      const isSafe = newHand.length === 0

      const newPile = [...gameState.pile, ...playedCards]

      const updatedPlayers = gameState.players.map((p, i) =>
        i === playerIndex
          ? { ...p, hand: newHand, isSafe, lastSeenAt: Date.now() }
          : p
      )

      const lastPlay = {
        playerId,
        playerName: player.name,
        cards: playedCards,
        claimedCount: cardIndices.length,
        claimedCard: declaredCard,
      }

      // Only non-safe alive players can challenge — safe players sit out
      const challengerIndex = getNextAlivePlayerIndex(updatedPlayers, playerIndex, true)

      // No eligible challenger → this player is last with cards, auto-faces roulette
      if (challengerIndex === null) {
        const updatedGameState = {
          ...gameState,
          status: 'roulette' as const,
          players: updatedPlayers,
          pile: newPile,
          pileCount: newPile.length,
          challengerIndex: null,
          lastPlay,
          roulettePlayerId: playerId,
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }
        await setGameState(updatedGameState)
        return updatedGameState.version
      }

      const updatedGameState = {
        ...gameState,
        status: 'challenge' as const,
        players: updatedPlayers,
        pile: newPile,
        pileCount: newPile.length,
        challengerIndex,
        lastPlay,
        version: gameState.version + 1,
        updatedAt: Date.now(),
      }

      await setGameState(updatedGameState)
      return updatedGameState.version
    })

    const response: GameActionResponse = { success: true, gameVersion: result }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Play cards error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to play cards'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
