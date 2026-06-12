import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { CreateGameRequestSchema } from '@/lib/schemas'
import { withGameLock, setGameState, getGameState } from '@/lib/redis'
import type { GameState, Player } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = CreateGameRequestSchema.safeParse(body)
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: Player name is required and must be 1-50 characters' },
        { status: 400 }
      )
    }

    const { playerName } = parseResult.data

    // Use distributed lock to ensure only one game can be created at a time
    const result = await withGameLock(async () => {
      // Check if a game already exists
      const existingGame = await getGameState()
      if (existingGame) {
        throw new Error('A game session already exists')
      }

      // Generate UUID for the player
      const playerId = randomUUID()
      const now = Date.now()

      // Create the host player
      const hostPlayer: Player = {
        id: playerId,
        name: playerName.trim(),
        hand: [], // Empty until cards are dealt
        isAlive: true,
        isSafe: false,
        isHost: true, // Creator becomes the host
        joinedAt: now,
        lastSeenAt: now
      }

      // Initialize the game state in lobby phase
      const initialGameState: GameState = {
        status: 'lobby',
        players: [hostPlayer],
        deck: [], // Empty until game starts
        tableCard: null, // Set when game starts
        pile: [], // Empty initially
        pileCount: 0,
        currentPlayerIndex: -1, // Not set until game starts
        challengerIndex: null,
        lastPlay: null,
        roulettePlayerId: null,
        roundNumber: 1,
        winnerId: null,
        version: 0, // Initial version
        createdAt: now,
        updatedAt: now
      }

      // Store the initial game state
      await setGameState(initialGameState)

      return {
        playerId,
        gameVersion: initialGameState.version
      }
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('Game creation error:', error)
    
    // Handle specific error types
    if (error instanceof Error && error.message === 'A game session already exists') {
      return NextResponse.json(
        { error: 'A game session already exists. Please join the existing game or wait for it to finish.' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    )
  }
}