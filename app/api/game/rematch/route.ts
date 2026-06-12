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
        const updatedRematchIds = alreadyRequested
          ? currentRematchIds
          : [...currentRematchIds, playerId]

        const isFirstClick = currentRematchIds.length === 0 && !alreadyRequested

        if (isFirstClick) {
          // Transition finished → lobby, keep all players but reset game state
          // Determine host: original host stays host; if clicking player is original host,
          // they become host; otherwise original host stays
          const originalHost = gameState.players.find(p => p.isHost)

          const resetPlayers = gameState.players.map(p => ({
            ...p,
            hand: [] as typeof p.hand,
            isSafe: false,
            isHost: originalHost ? p.id === originalHost.id : p.id === playerId,
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
            chamber: undefined,
            chamberIndex: undefined,
            currentPlayerIndex: -1,
            rematchPlayerIds: updatedRematchIds,
            version: gameState.version + 1,
            updatedAt: Date.now(),
          }

          await setGameState(updatedState)
          return updatedState.version
        } else {
          // Subsequent finished-state click: just add to rematchPlayerIds
          if (alreadyRequested) {
            // No change needed, idempotent
            return gameState.version
          }

          const updatedState = {
            ...gameState,
            rematchPlayerIds: updatedRematchIds,
            version: gameState.version + 1,
            updatedAt: Date.now(),
          }
          await setGameState(updatedState)
          return updatedState.version
        }
      } else {
        // status === 'lobby'
        // Player is already in the lobby (kept from original game)
        // Just add them to rematchPlayerIds if not already there
        if (alreadyRequested) {
          return gameState.version
        }

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
