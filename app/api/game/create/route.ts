import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'crypto'
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

    const { playerName, settings } = parseResult.data
    const bullets = settings?.bullets ?? 1
    const devilMode = settings?.devilMode ?? false

    // Generate a join code upfront so we can lock on it
    const joinCode = randomBytes(2).toString('hex').toUpperCase()

    // Use distributed lock keyed to the new code
    const result = await withGameLock(joinCode, async () => {
      // Check if a game with this code already exists
      const existingGame = await getGameState(joinCode)
      if (existingGame && existingGame.status !== 'finished') {
        throw new Error('A game session already exists')
      }

      const playerId = randomUUID()
      const now = Date.now()

      const hostPlayer: Player = {
        id: playerId,
        name: playerName.trim(),
        hand: [],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: now,
        lastSeenAt: now
      }

      const initialGameState: GameState = {
        status: 'lobby',
        players: [hostPlayer],
        deck: [],
        tableCard: null,
        pile: [],
        pileCount: 0,
        currentPlayerIndex: -1,
        challengerIndex: null,
        lastPlay: null,
        roulettePlayerIds: [],
        roundNumber: 1,
        winnerId: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
        joinCode,
        settings: { bullets, devilMode }
      }

      await setGameState(initialGameState)

      return {
        playerId,
        gameVersion: initialGameState.version,
        joinCode
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
