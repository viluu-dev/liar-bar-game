import { NextRequest, NextResponse } from 'next/server'
import { KickPlayerRequestSchema } from '@/lib/schemas'
import { withGameLock, getGameState, setGameState } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = KickPlayerRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: hostId and targetId must be valid UUIDs' },
        { status: 400 }
      )
    }

    const { hostId, targetId, joinCode } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'lobby') {
        throw new Error('Can only kick players during lobby phase')
      }

      const host = gameState.players.find(p => p.id === hostId)
      if (!host || !host.isHost) {
        throw new Error('Only the host can kick players')
      }

      const targetExists = gameState.players.some(p => p.id === targetId)
      if (!targetExists) {
        throw new Error('Target player not found')
      }

      const updatedState = {
        ...gameState,
        players: gameState.players.filter(p => p.id !== targetId),
        version: gameState.version + 1,
        updatedAt: Date.now()
      }

      await setGameState(updatedState)
      return updatedState.version
    })

    return NextResponse.json({ success: true, gameVersion: result })
  } catch (error) {
    console.error('Kick player error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to kick player'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
