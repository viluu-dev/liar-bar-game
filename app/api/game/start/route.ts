import { NextRequest, NextResponse } from 'next/server'
import { StartGameRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { createInitialDeck, shuffleDeck, dealCards, selectTableCard } from '@/lib/game-logic'
import type { GameActionResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = StartGameRequestSchema.safeParse(body)
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    const { playerId } = parseResult.data

    // Use distributed lock to prevent concurrent modifications
    const result = await withGameLock(async () => {
      const gameState = await getGameState()
      
      // Validate game exists
      if (!gameState) {
        throw new Error('No active game session found')
      }

      // Validate game is in lobby phase
      if (gameState.status !== 'lobby') {
        throw new Error('Game has already started or is in progress')
      }

      // Find the requesting player
      const player = gameState.players.find(p => p.id === playerId)
      if (!player) {
        throw new Error('Player not found in current game session')
      }

      // Validate player is the host
      if (!player.isHost) {
        throw new Error('Only the host can start the game')
      }

      // Validate minimum player count
      if (gameState.players.length < 2) {
        throw new Error('At least 2 players are required to start the game')
      }

      // Create and shuffle the deck
      const initialDeck = createInitialDeck()
      const shuffledDeck = shuffleDeck(initialDeck)
      
      // Deal 5 cards to each player
      const dealResult = dealCards(shuffledDeck, gameState.players.length)
      
      // Select a random Table Card for this round
      const tableCard = selectTableCard()
      
      // Update each player with their dealt hand
      const playersWithHands = gameState.players.map((player, index) => ({
        ...player,
        hand: dealResult.playerHands[index],
        lastSeenAt: Date.now() // Update last seen when game starts
      }))
      
      // Set the first player as current player (index 0)
      const currentPlayerIndex = 0
      
      // Create updated game state with dealt cards and playing status
      const updatedGameState = {
        ...gameState,
        status: 'playing' as const,
        players: playersWithHands,
        deck: dealResult.remainingDeck,
        tableCard: tableCard,
        pile: [], // Empty pile at start
        pileCount: 0,
        currentPlayerIndex: currentPlayerIndex,
        challengerIndex: null, // No challenger at start
        lastPlay: null, // No plays yet
        version: gameState.version + 1,
        updatedAt: Date.now()
      }

      await setGameState(updatedGameState)
      
      return updatedGameState.version
    })

    const response: GameActionResponse = {
      success: true,
      gameVersion: result
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Start game error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to start game'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    )
  }
}