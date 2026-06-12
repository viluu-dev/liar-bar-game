import { NextRequest, NextResponse } from 'next/server'
import { RematchRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = RematchRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId and joinCode are required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode } = parseResult.data

    const gameVersion = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'finished' && gameState.status !== 'lobby') {
        throw new Error('Game is not in finished or lobby state')
      }

      const playerInGame = gameState.players.find(p => p.id === playerId)
      if (!playerInGame) {
        throw new Error('Player not found in current game session')
      }

      const currentRematchIds = gameState.rematchPlayerIds ?? []
      const alreadyRequested = currentRematchIds.includes(playerId)

      if (gameState.status === 'finished') {
        if (playerInGame.isHost) {
          // Host: create lobby immediately — all players reset and redirected via polling
          const resetPlayers = gameState.players.map(p => ({
            ...p,
            hand: [] as typeof p.hand,
            isAlive: true,
            isSafe: false,
            isHost: p.isHost, // keep original host assignment
            chamber: undefined,
            chamberIndex: undefined,
          }))

          const updatedState = {
            ...gameState,
            status: 'lobby' as const,
            players: resetPlayers,
            deck: [] as typeof gameState.deck,
            pile: [] as typeof gameState.pile,
            pileCount: 0,
            tableCard: null,
            lastPlay: null,
            challengerIndex: null,
            roulettePlayerId: null,
            winnerId: null,
            currentPlayerIndex: -1,
            rematchPlayerIds: [],
            version: gameState.version + 1,
            updatedAt: Date.now(),
          }

          await setGameState(updatedState)
          return updatedState.version
        } else {
          // Non-host: record interest only, stay in finished state
          if (alreadyRequested) return gameState.version

          const updatedState = {
            ...gameState,
            rematchPlayerIds: [...currentRematchIds, playerId],
            version: gameState.version + 1,
            updatedAt: Date.now(),
          }
          await setGameState(updatedState)
          return updatedState.version
        }
      } else {
        // status === 'lobby' — host already created lobby, player is in it via polling redirect
        if (alreadyRequested) return gameState.version
        const updatedState = {
          ...gameState,
          rematchPlayerIds: [...currentRematchIds, playerId],
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }
        await setGameState(updatedState)
        return updatedState.version
      }
    })

    return NextResponse.json({ success: true, gameVersion })
  } catch (error) {
    console.error('Rematch error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to process rematch request'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
