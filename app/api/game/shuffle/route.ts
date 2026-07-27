import { NextRequest, NextResponse } from 'next/server'
import { ShuffleRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { shuffleArray } from '@/lib/game-logic'
import type { GameActionResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = ShuffleRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    const { playerId, joinCode } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'lobby') {
        throw new Error('Can only shuffle seating during lobby phase')
      }

      const player = gameState.players.find(p => p.id === playerId)
      if (!player) {
        throw new Error('Player not found in current game session')
      }

      if (!player.isHost) {
        throw new Error('Only the host can shuffle seating')
      }

      const updatedState = {
        ...gameState,
        players: shuffleArray(gameState.players),
        version: gameState.version + 1,
        updatedAt: Date.now(),
      }

      await setGameState(updatedState)
      return updatedState.version
    })

    const response: GameActionResponse = {
      success: true,
      gameVersion: result,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Shuffle seating error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to shuffle seating'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
