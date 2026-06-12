import { NextRequest, NextResponse } from 'next/server'
import { GameStateQuerySchema } from '@/lib/schemas'
import { getGameState, setGameState, projectGameView } from '@/lib/redis'
import type { GameStateResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Extract and validate query parameters
    const { searchParams } = new URL(request.url)
    const playerIdParam = searchParams.get('playerId')
    const sinceParam = searchParams.get('since')
    
    const queryParams = {
      playerId: playerIdParam,
      ...(sinceParam && { since: sinceParam })
    }
    
    const parseResult = GameStateQuerySchema.safeParse(queryParams)
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    const { playerId, since } = parseResult.data

    // Retrieve current game state
    const gameState = await getGameState()
    
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
    try {
      await setGameState(updatedGameState)
    } catch (error) {
      // Log but don't fail the request if timestamp update fails
      console.warn('Failed to update lastSeenAt timestamp:', error)
      // Use original state for projection
    }

    // Use projectGameView to ensure data security
    const projectedState = projectGameView(updatedGameState, playerId)
    
    const response: GameStateResponse = {
      version: updatedGameState.version,
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