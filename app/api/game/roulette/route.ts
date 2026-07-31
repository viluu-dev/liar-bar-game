import { NextRequest, NextResponse } from 'next/server'
import { RouletteRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { applyRoulettePull } from '@/lib/game-logic'
import type { RouletteResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = RouletteRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'roulette') {
        throw new Error('Game is not in roulette phase')
      }

      if (!gameState.roulettePlayerIds.includes(playerId)) {
        throw new Error('Only a designated shooter can pull the trigger')
      }

      const playerIndex = gameState.players.findIndex(p => p.id === playerId)
      if (playerIndex === -1) {
        throw new Error('Player not found in current game session')
      }

      if (!gameState.players[playerIndex].isAlive) {
        throw new Error('Player is already eliminated')
      }

      const { state: updatedGameState, result: pullResult } = applyRoulettePull(gameState, playerId, Date.now())

      await setGameState(updatedGameState)
      return { version: updatedGameState.version, result: pullResult }
    })

    const response: RouletteResponse = {
      success: true,
      gameVersion: result.version,
      result: result.result,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Roulette error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to process roulette'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
