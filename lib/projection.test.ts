/**
 * Tests for game state projection security
 * Validates that private data is properly stripped from client views
 */

import { describe, it, expect } from 'vitest'
import { projectGameView } from './redis'
import { GameState, Player, LastPlay, Card } from './schemas'

// Helper function to create a test game state
function createTestGameState(): GameState {
  const players: Player[] = [
    {
      id: 'player-1-uuid',
      name: 'Alice',
      hand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'] as Card[],
      isAlive: true,
      isSafe: false,
      isHost: true,
      joinedAt: Date.now() - 5000,
      lastSeenAt: Date.now() - 1000,
    },
    {
      id: 'player-2-uuid',
      name: 'Bob',
      hand: ['KING', 'QUEEN', 'JOKER'] as Card[],
      isAlive: true,
      isSafe: false,
      isHost: false,
      joinedAt: Date.now() - 4000,
      lastSeenAt: Date.now() - 500,
    },
    {
      id: 'player-3-uuid',
      name: 'Charlie',
      hand: ['ACE', 'ACE'] as Card[],
      isAlive: false, // eliminated player
      isSafe: false,
      isHost: false,
      joinedAt: Date.now() - 3000,
      lastSeenAt: Date.now() - 2000,
    }
  ]

  const lastPlay: LastPlay = {
    playerId: 'player-1-uuid',
    playerName: 'Alice',
    cards: ['KING', 'KING'] as Card[],
    claimedCount: 2,
    claimedCard: 'KING'
  }

  return {
    status: 'challenge',
    players,
    deck: ['ACE', 'QUEEN', 'JOKER', 'KING', 'ACE'] as Card[], // Server-only data
    tableCard: 'KING',
    pile: ['KING', 'KING', 'ACE'] as Card[], // Server-only data
    pileCount: 3,
    currentPlayerIndex: 0,
    challengerIndex: 1,
    lastPlay,
    roulettePlayerId: null,
    roundNumber: 2,
    winnerId: null,
    version: 15,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 100,
  }
}

describe('projectGameView', () => {
  describe('Private Data Security', () => {
    it('should never expose deck field to clients', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      // Deck field should not exist in projection
      expect('deck' in projection).toBe(false)
      expect((projection as any).deck).toBeUndefined()
    })

    it('should never expose pile field to clients', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      // Pile field should not exist in projection
      expect('pile' in projection).toBe(false)
      expect((projection as any).pile).toBeUndefined()
    })

    it('should expose pileCount but not actual pile cards', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.pileCount).toBe(3)
      expect('pile' in projection).toBe(false)
    })
  })

  describe('Hand Privacy', () => {
    it('should only expose requesting player\'s own hand', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      // Should have player 1's hand
      expect(projection.myHand).toEqual(['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'])
    })

    it('should return empty hand for non-existent player', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'non-existent-uuid')
      
      expect(projection.myHand).toEqual([])
    })

    it('should replace opponent hand arrays with handCount numbers', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      // Check each projected player
      expect(projection.players[0].handCount).toBe(5) // Alice (requesting player)
      expect(projection.players[1].handCount).toBe(3) // Bob
      expect(projection.players[2].handCount).toBe(2) // Charlie
      
      // Verify hand arrays don't exist in projected players
      projection.players.forEach(player => {
        expect('hand' in player).toBe(false)
        expect((player as any).hand).toBeUndefined()
      })
    })

    it('should preserve all non-private player fields', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-2-uuid')
      
      const originalPlayer = gameState.players[1] // Bob
      const projectedPlayer = projection.players[1]
      
      expect(projectedPlayer.id).toBe(originalPlayer.id)
      expect(projectedPlayer.name).toBe(originalPlayer.name)
      expect(projectedPlayer.isAlive).toBe(originalPlayer.isAlive)
      expect(projectedPlayer.isSafe).toBe(originalPlayer.isSafe)
      expect(projectedPlayer.isHost).toBe(originalPlayer.isHost)
      expect(projectedPlayer.joinedAt).toBe(originalPlayer.joinedAt)
      expect(projectedPlayer.lastSeenAt).toBe(originalPlayer.lastSeenAt)
    })
  })

  describe('Last Play Security', () => {
    it('should omit cards from lastPlay projection', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.lastPlay).toBeDefined()
      expect(projection.lastPlay!.playerId).toBe('player-1-uuid')
      expect(projection.lastPlay!.playerName).toBe('Alice')
      expect(projection.lastPlay!.claimedCount).toBe(2)
      expect(projection.lastPlay!.claimedCard).toBe('KING')
      
      // Cards should be omitted
      expect('cards' in projection.lastPlay!).toBe(false)
      expect((projection.lastPlay as any)?.cards).toBeUndefined()
    })

    it('should handle null lastPlay correctly', () => {
      const gameState = createTestGameState()
      gameState.lastPlay = null
      
      const projection = projectGameView(gameState, 'player-1-uuid')
      expect(projection.lastPlay).toBeNull()
    })
  })

  describe('Player-Specific Views', () => {
    it('should show different myHand for different requesting players', () => {
      const gameState = createTestGameState()
      
      const aliceView = projectGameView(gameState, 'player-1-uuid')
      const bobView = projectGameView(gameState, 'player-2-uuid')
      const charlieView = projectGameView(gameState, 'player-3-uuid')
      
      expect(aliceView.myHand).toEqual(['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'])
      expect(bobView.myHand).toEqual(['KING', 'QUEEN', 'JOKER'])
      expect(charlieView.myHand).toEqual(['ACE', 'ACE'])
    })

    it('should preserve game state fields that are public', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.status).toBe('challenge')
      expect(projection.tableCard).toBe('KING')
      expect(projection.currentPlayerIndex).toBe(0)
      expect(projection.challengerIndex).toBe(1)
      expect(projection.roulettePlayerId).toBeNull()
      expect(projection.roundNumber).toBe(2)
      expect(projection.winnerId).toBeNull()
      expect(projection.version).toBe(15)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain exact player order in projection', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.players).toHaveLength(3)
      expect(projection.players[0].name).toBe('Alice')
      expect(projection.players[1].name).toBe('Bob')
      expect(projection.players[2].name).toBe('Charlie')
    })

    it('should not mutate original game state', () => {
      const gameState = createTestGameState()
      const originalDeck = [...gameState.deck]
      const originalPile = [...gameState.pile]
      const originalAliceHand = [...gameState.players[0].hand]
      
      projectGameView(gameState, 'player-1-uuid')
      
      // Verify original state is unchanged
      expect(gameState.deck).toEqual(originalDeck)
      expect(gameState.pile).toEqual(originalPile)
      expect(gameState.players[0].hand).toEqual(originalAliceHand)
    })

    it('should handle eliminated players correctly', () => {
      const gameState = createTestGameState()
      const projection = projectGameView(gameState, 'player-3-uuid') // Charlie is eliminated
      
      expect(projection.myHand).toEqual(['ACE', 'ACE']) // Still gets their hand
      expect(projection.players[2].isAlive).toBe(false) // Correctly shows as eliminated
      expect(projection.players[2].handCount).toBe(2) // Still shows card count
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty player list', () => {
      const gameState = createTestGameState()
      gameState.players = []
      
      const projection = projectGameView(gameState, 'any-player-id')
      
      expect(projection.players).toEqual([])
      expect(projection.myHand).toEqual([])
    })

    it('should handle players with empty hands', () => {
      const gameState = createTestGameState()
      gameState.players[0].hand = []
      
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.myHand).toEqual([])
      expect(projection.players[0].handCount).toBe(0)
    })

    it('should handle game state with all null/undefined optional fields', () => {
      const gameState = createTestGameState()
      gameState.tableCard = null
      gameState.challengerIndex = null
      gameState.lastPlay = null
      gameState.roulettePlayerId = null
      gameState.winnerId = null
      
      const projection = projectGameView(gameState, 'player-1-uuid')
      
      expect(projection.tableCard).toBeNull()
      expect(projection.challengerIndex).toBeNull()
      expect(projection.lastPlay).toBeNull()
      expect(projection.roulettePlayerId).toBeNull()
      expect(projection.winnerId).toBeNull()
    })
  })
})