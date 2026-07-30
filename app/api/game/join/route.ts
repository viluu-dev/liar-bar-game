import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { JoinGameRequestSchema } from '@/lib/schemas'
import { withGameLock, setGameState, getGameState } from '@/lib/redis'
import { MAX_PLAYERS } from '@/lib/constants'
import type { Player } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = JoinGameRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: Player name is required and must be 1-50 characters' },
        { status: 400 }
      )
    }

    const { playerName, joinCode } = parseResult.data

    if (!joinCode) {
      return NextResponse.json(
        { error: 'Join code is required.' },
        { status: 400 }
      )
    }

    // Use distributed lock to ensure atomic game state updates
    const result = await withGameLock(joinCode, async () => {
      // Check if a game exists with this code
      const gameState = await getGameState(joinCode)
      if (!gameState) {
        throw new Error('No game session exists')
      }

      // Validate game is in lobby phase
      if (gameState.status !== 'lobby') {
        throw new Error('Game is already in progress')
      }

      // Validate join code matches
      if (joinCode.toUpperCase() !== gameState.joinCode) {
        throw new Error('Invalid join code')
      }

      // Enforce player maximum limit
      if (gameState.players.length >= MAX_PLAYERS) {
        throw new Error(`Game is full (maximum ${MAX_PLAYERS} players)`)
      }

      // Check for duplicate names (optional but good UX)
      const trimmedName = playerName.trim()
      const existingPlayer = gameState.players.find(
        p => p.name.toLowerCase() === trimmedName.toLowerCase()
      )
      if (existingPlayer) {
        throw new Error('A player with that name has already joined')
      }

      // Generate UUID for the new player
      const playerId = randomUUID()
      const now = Date.now()

      // Create the new player
      const newPlayer: Player = {
        id: playerId,
        name: trimmedName,
        hand: [], // Empty until cards are dealt
        isAlive: true,
        isSafe: false,
        isHost: false, // Only creator is host
        joinedAt: now,
        lastSeenAt: now
      }

      // Add player to existing game state
      const updatedGameState = {
        ...gameState,
        players: [...gameState.players, newPlayer],
        version: gameState.version + 1, // Increment version for polling
        updatedAt: now
      }

      // Store the updated game state
      await setGameState(updatedGameState)

      return {
        playerId
      }
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('Game join error:', error)

    // Handle specific error types with appropriate status codes
    if (error instanceof Error) {
      switch (error.message) {
        case 'No game session exists':
          return NextResponse.json(
            { error: 'No game session exists. Create a new game first.' },
            { status: 404 }
          )
        case 'Game is already in progress':
          return NextResponse.json(
            { error: 'Cannot join game - it has already started.' },
            { status: 409 }
          )
        case `Game is full (maximum ${MAX_PLAYERS} players)`:
          return NextResponse.json(
            { error: `Cannot join game - maximum of ${MAX_PLAYERS} players allowed.` },
            { status: 409 }
          )
        case 'A player with that name has already joined':
          return NextResponse.json(
            { error: 'A player with that name has already joined. Please choose a different name.' },
            { status: 409 }
          )
        case 'Invalid join code':
          return NextResponse.json(
            { error: 'Invalid join code.' },
            { status: 400 }
          )
      }
    }

    return NextResponse.json(
      { error: 'Failed to join game' },
      { status: 500 }
    )
  }
}
