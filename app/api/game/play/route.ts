import { NextRequest, NextResponse } from 'next/server'
import { PlayCardsRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { applyCardPlay } from '@/lib/game-logic'
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

      // Extended per docs/ui-redesign-round-table.md section 3: collapses the
      // old standalone "believe" transition into this call. When called while
      // status === 'challenge' by the designated challenger, this performs
      // the believe-transition and the play atomically in the same lock —
      // no separate endpoint, no two-fetch chaining from the client.
      let effectiveState = gameState
      let playerIndex: number

      if (gameState.status === 'challenge') {
        if (gameState.challengerIndex === null) throw new Error('No challenger set for this challenge')
        const challenger = gameState.players[gameState.challengerIndex]
        if (challenger.id !== playerId) throw new Error('Only the designated challenger can respond')
        if (!challenger.isAlive) throw new Error('Eliminated players cannot challenge')
        // Defensive: the UI only offers "Play" with a non-empty hand, so a
        // safe (hand-empty) challenger should never reach this path, but the
        // route must not trust that.
        if (challenger.isSafe) throw new Error('Safe players cannot play cards')
        effectiveState = {
          ...gameState,
          status: 'playing',
          currentPlayerIndex: gameState.challengerIndex,
          challengerIndex: null,
          lastPlay: null,
        }
        playerIndex = gameState.challengerIndex
      } else if (gameState.status === 'playing') {
        playerIndex = gameState.players.findIndex(p => p.id === playerId)
        if (playerIndex !== gameState.currentPlayerIndex) throw new Error('It is not your turn')
      } else {
        throw new Error('Game is not in playing phase')
      }

      const updatedGameState = applyCardPlay(effectiveState, playerIndex, cardIndices, declaredCard, Date.now())
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
