import { NextRequest, NextResponse } from 'next/server'
import { GameStateQuerySchema } from '@/lib/schemas'
import { getGameState, setGameState, projectGameView, withGameLock } from '@/lib/redis'
import { autoSkipIfInactive, autoPullIfRouletteExpired } from '@/lib/game-logic'
import type { GameState, GameStateResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Extract and validate query parameters
    const { searchParams } = new URL(request.url)
    const playerIdParam = searchParams.get('playerId')
    const codeParam = searchParams.get('code')
    const sinceParam = searchParams.get('since')

    const queryParams = {
      playerId: playerIdParam,
      code: codeParam,
      ...(sinceParam && { since: sinceParam })
    }

    const parseResult = GameStateQuerySchema.safeParse(queryParams)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    const { playerId, code, since } = parseResult.data

    // Retrieve current game state
    const gameState = await getGameState(code)

    // Handle non-existent game gracefully
    if (!gameState) {
      const response: GameStateResponse = {
        version: 0,
        changed: false,
        phase: "none"
      }
      return NextResponse.json(response)
    }

    // Version-based change detection for efficiency
    if (since !== undefined && gameState.version === since) {
      const response: GameStateResponse = {
        version: gameState.version,
        changed: false
      }
      return NextResponse.json(response)
    }

    // Validate that the requesting player exists in the game
    const playerExists = gameState.players.some(player => player.id === playerId)
    if (!playerExists) {
      return NextResponse.json(
        { error: 'Player not found in current game session' },
        { status: 404 }
      )
    }

    // Update the player's lastSeenAt timestamp
    const updatedGameState = {
      ...gameState,
      players: gameState.players.map(player =>
        player.id === playerId
          ? { ...player, lastSeenAt: Date.now() }
          : player
      ),
      version: gameState.version + 1,
      updatedAt: Date.now()
    }

    // Store the updated state with new lastSeenAt
    // Note: We don't use withGameLock here as this is a read operation with minimal write
    // The timestamp update is not critical and doesn't need full consistency
    // publish: false — this is a heartbeat, not a real change; publishing here would
    // create a poll -> publish -> refetch -> poll storm across every connected client
    try {
      await setGameState(updatedGameState, { publish: false })
    } catch (error) {
      // Log but don't fail the request if timestamp update fails
      console.warn('Failed to update lastSeenAt timestamp:', error)
      // Use original state for projection
    }

    // Auto-skip inactive player, or auto-pull an expired roulette countdown
    // (non-blocking — lock failure means another poller is handling it). The
    // two are mutually exclusive by status (never simultaneously
    // 'playing'/'challenge' and 'roulette'), hence the simple `??` fallback.
    let finalState = updatedGameState
    try {
      const advanced = await withGameLock(code, async () => {
        const fresh = await getGameState(code)
        if (!fresh) return null
        const next = autoSkipIfInactive(fresh as GameState, Date.now()) ?? autoPullIfRouletteExpired(fresh as GameState, Date.now())
        if (!next) return null
        await setGameState(next as GameState)
        return next as GameState
      })
      if (advanced) finalState = advanced
    } catch { /* lock contention — another poller handled it */ }

    // Use projectGameView to ensure data security
    const projectedState = projectGameView(finalState, playerId)

    const response: GameStateResponse = {
      version: finalState.version,
      changed: true,
      gameState: projectedState
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Game state polling error:', error)

    return NextResponse.json(
      { error: 'Failed to retrieve game state' },
      { status: 500 }
    )
  }
}
