/**
 * Advanced tests for complex Zod validation schemas
 */

import { describe, it, expect } from 'vitest'
import {
  GameStateSchema,
  ProjectedGameStateSchema,
  GameStateResponseSchema,
  GameCreateResponseSchema,
  GameJoinResponseSchema,
  GameActionResponseSchema,
  RouletteResponseSchema
} from './schemas'

describe('GameStateSchema', () => {
  const validGameState = {
    status: 'playing' as const,
    players: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Player1',
        hand: ['ACE', 'KING'],
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: 1640995200000,
        lastSeenAt: 1640995260000
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Player2',
        hand: ['QUEEN', 'JOKER', 'ACE'],
        isAlive: true,
        isSafe: false,
        isHost: false,
        joinedAt: 1640995210000,
        lastSeenAt: 1640995270000
      }
    ],
    deck: ['KING', 'QUEEN', 'JOKER'],
    tableCard: 'ACE' as const,
    pile: ['ACE', 'ACE'],
    pileCount: 2,
    currentPlayerIndex: 1,
    challengerIndex: 0,
    lastPlay: {
      playerId: '550e8400-e29b-41d4-a716-446655440001',
      playerName: 'Player2',
      cards: ['ACE', 'ACE'],
      claimedCount: 2,
      claimedCard: 'ACE' as const,
      isDevilPlay: false
    },
    roulettePlayerIds: [],
    roundNumber: 1,
    winnerId: null,
    version: 42,
    createdAt: 1640995200000,
    updatedAt: 1640995300000,
    devilPlayerId: null,
    devilRank: null
  }

  it('should validate complete valid game state', () => {
    expect(() => GameStateSchema.parse(validGameState)).not.toThrow()
  })

  it('should enforce maximum 8 players', () => {
    const tooManyPlayers = {
      ...validGameState,
      players: Array(9).fill(validGameState.players[0])
    }
    expect(() => GameStateSchema.parse(tooManyPlayers)).toThrow()
  })

  it('should allow empty players array', () => {
    const emptyGame = {
      ...validGameState,
      players: []
    }
    expect(() => GameStateSchema.parse(emptyGame)).not.toThrow()
  })

  it('should validate nullable fields', () => {
    const nullableFields = {
      ...validGameState,
      tableCard: null,
      challengerIndex: null,
      lastPlay: null,
      roulettePlayerIds: [],
      winnerId: null
    }
    expect(() => GameStateSchema.parse(nullableFields)).not.toThrow()
  })

  it('should reject negative currentPlayerIndex below -1', () => {
    expect(() => GameStateSchema.parse({
      ...validGameState,
      currentPlayerIndex: -2
    })).toThrow()
  })

  it('should allow -1 for currentPlayerIndex (no active player)', () => {
    expect(() => GameStateSchema.parse({
      ...validGameState,
      currentPlayerIndex: -1
    })).not.toThrow()
  })

  it('should reject negative pileCount', () => {
    expect(() => GameStateSchema.parse({
      ...validGameState,
      pileCount: -1
    })).toThrow()
  })

  it('should reject round number less than 1', () => {
    expect(() => GameStateSchema.parse({
      ...validGameState,
      roundNumber: 0
    })).toThrow()
  })
})

describe('ProjectedGameStateSchema', () => {
  const validProjectedGameState = {
    status: 'playing' as const,
    players: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Player1',
        handCount: 2,
        isAlive: true,
        isSafe: false,
        isHost: true,
        joinedAt: 1640995200000,
        lastSeenAt: 1640995260000
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Player2',
        handCount: 3,
        isAlive: true,
        isSafe: false,
        isHost: false,
        joinedAt: 1640995210000,
        lastSeenAt: 1640995270000
      }
    ],
    myHand: ['ACE', 'KING'],
    tableCard: 'ACE' as const,
    pileCount: 2,
    currentPlayerIndex: 1,
    challengerIndex: 0,
    lastPlay: {
      playerId: '550e8400-e29b-41d4-a716-446655440001',
      playerName: 'Player2',
      claimedCount: 2,
      claimedCard: 'ACE' as const
    },
    roulettePlayerIds: [],
    roundNumber: 1,
    winnerId: null,
    version: 42,
    myDevilRank: null
  }

  it('should validate complete projected game state', () => {
    expect(() => ProjectedGameStateSchema.parse(validProjectedGameState)).not.toThrow()
  })

  it('should enforce maximum 5 cards in myHand', () => {
    expect(() => ProjectedGameStateSchema.parse({
      ...validProjectedGameState,
      myHand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE', 'KING'] // 6 cards
    })).toThrow()
  })

  it('should allow empty myHand', () => {
    expect(() => ProjectedGameStateSchema.parse({
      ...validProjectedGameState,
      myHand: []
    })).not.toThrow()
  })
})

describe('API Response Schemas', () => {
  it('should validate game state response with game data', () => {
    const response = {
      version: 42,
      changed: true,
      gameState: {
        status: 'lobby' as const,
        players: [],
        myHand: [],
        tableCard: null,
        pileCount: 0,
        currentPlayerIndex: -1,
        challengerIndex: null,
        lastPlay: null,
        roulettePlayerIds: [],
        roundNumber: 1,
        winnerId: null,
        version: 42,
        myDevilRank: null
      }
    }
    expect(() => GameStateResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate game state response with no changes', () => {
    const response = {
      version: 42,
      changed: false
    }
    expect(() => GameStateResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate game state response with no game', () => {
    const response = {
      version: 0,
      changed: true,
      phase: 'none' as const
    }
    expect(() => GameStateResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate game create response', () => {
    const response = {
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      gameVersion: 1
    }
    expect(() => GameCreateResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate game join response', () => {
    const response = {
      playerId: '550e8400-e29b-41d4-a716-446655440000'
    }
    expect(() => GameJoinResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate game action response', () => {
    const response = {
      success: true,
      gameVersion: 42
    }
    expect(() => GameActionResponseSchema.parse(response)).not.toThrow()
  })

  it('should validate roulette response', () => {
    const response = {
      success: true,
      gameVersion: 42,
      result: 'eliminated' as const
    }
    expect(() => RouletteResponseSchema.parse(response)).not.toThrow()
  })

  it('should reject invalid roulette result', () => {
    const response = {
      success: true,
      gameVersion: 42,
      result: 'invalid'
    }
    expect(() => RouletteResponseSchema.parse(response)).toThrow()
  })
})