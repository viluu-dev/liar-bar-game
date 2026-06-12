/**
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest'
import {
  CardSchema,
  TableCardSchema,
  GameStatusSchema,
  PlayerSchema,
  ProjectedPlayerSchema,
  LastPlaySchema,
  ProjectedLastPlaySchema,
  GameStateSchema,
  ProjectedGameStateSchema,
  CreateGameRequestSchema,
  JoinGameRequestSchema,
  StartGameRequestSchema,
  PlayCardsRequestSchema,
  ChallengeRequestSchema,
  RouletteRequestSchema,
  GameStateQuerySchema
} from './schemas'

describe('Card Schemas', () => {
  it('should validate valid cards', () => {
    expect(() => CardSchema.parse('ACE')).not.toThrow()
    expect(() => CardSchema.parse('KING')).not.toThrow()
    expect(() => CardSchema.parse('QUEEN')).not.toThrow()
    expect(() => CardSchema.parse('JOKER')).not.toThrow()
  })

  it('should reject invalid cards', () => {
    expect(() => CardSchema.parse('INVALID')).toThrow()
    expect(() => CardSchema.parse('ace')).toThrow()
    expect(() => CardSchema.parse('')).toThrow()
  })

  it('should validate table cards (no jokers)', () => {
    expect(() => TableCardSchema.parse('ACE')).not.toThrow()
    expect(() => TableCardSchema.parse('KING')).not.toThrow()
    expect(() => TableCardSchema.parse('QUEEN')).not.toThrow()
  })

  it('should reject jokers as table cards', () => {
    expect(() => TableCardSchema.parse('JOKER')).toThrow()
  })
})

describe('GameStatusSchema', () => {
  it('should validate all game statuses', () => {
    expect(() => GameStatusSchema.parse('lobby')).not.toThrow()
    expect(() => GameStatusSchema.parse('playing')).not.toThrow()
    expect(() => GameStatusSchema.parse('challenge')).not.toThrow()
    expect(() => GameStatusSchema.parse('roulette')).not.toThrow()
    expect(() => GameStatusSchema.parse('finished')).not.toThrow()
  })

  it('should reject invalid statuses', () => {
    expect(() => GameStatusSchema.parse('invalid')).toThrow()
    expect(() => GameStatusSchema.parse('LOBBY')).toThrow()
  })
})

describe('PlayerSchema', () => {
  const validPlayer = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'TestPlayer',
    hand: ['ACE', 'KING'],
    isAlive: true,
    isSafe: false,
    isHost: false,
    joinedAt: 1640995200000,
    lastSeenAt: 1640995260000
  }

  it('should validate valid player', () => {
    expect(() => PlayerSchema.parse(validPlayer)).not.toThrow()
  })

  it('should reject invalid UUID', () => {
    expect(() => PlayerSchema.parse({
      ...validPlayer,
      id: 'invalid-uuid'
    })).toThrow()
  })

  it('should reject empty name', () => {
    expect(() => PlayerSchema.parse({
      ...validPlayer,
      name: ''
    })).toThrow()
  })

  it('should reject name over 50 characters', () => {
    expect(() => PlayerSchema.parse({
      ...validPlayer,
      name: 'a'.repeat(51)
    })).toThrow()
  })

  it('should trim whitespace from names', () => {
    const result = PlayerSchema.parse({
      ...validPlayer,
      name: '  TestPlayer  '
    })
    expect(result.name).toBe('TestPlayer')
  })

  it('should reject invalid cards in hand', () => {
    expect(() => PlayerSchema.parse({
      ...validPlayer,
      hand: ['ACE', 'INVALID']
    })).toThrow()
  })
})

describe('ProjectedPlayerSchema', () => {
  const validProjectedPlayer = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'TestPlayer',
    handCount: 3,
    isAlive: true,
    isSafe: false,
    isHost: false,
    joinedAt: 1640995200000,
    lastSeenAt: 1640995260000
  }

  it('should validate valid projected player', () => {
    expect(() => ProjectedPlayerSchema.parse(validProjectedPlayer)).not.toThrow()
  })

  it('should reject negative hand count', () => {
    expect(() => ProjectedPlayerSchema.parse({
      ...validProjectedPlayer,
      handCount: -1
    })).toThrow()
  })

  it('should reject hand count over 5', () => {
    expect(() => ProjectedPlayerSchema.parse({
      ...validProjectedPlayer,
      handCount: 6
    })).toThrow()
  })
})

describe('LastPlaySchema', () => {
  const validLastPlay = {
    playerId: '550e8400-e29b-41d4-a716-446655440000',
    playerName: 'TestPlayer',
    cards: ['ACE', 'ACE'],
    claimedCount: 2,
    claimedCard: 'ACE'
  }

  it('should validate valid last play', () => {
    expect(() => LastPlaySchema.parse(validLastPlay)).not.toThrow()
  })

  it('should reject empty cards array', () => {
    expect(() => LastPlaySchema.parse({
      ...validLastPlay,
      cards: []
    })).toThrow()
  })

  it('should reject more than 3 cards', () => {
    expect(() => LastPlaySchema.parse({
      ...validLastPlay,
      cards: ['ACE', 'ACE', 'ACE', 'ACE']
    })).toThrow()
  })

  it('should reject claimed count outside 1-3 range', () => {
    expect(() => LastPlaySchema.parse({
      ...validLastPlay,
      claimedCount: 0
    })).toThrow()
    
    expect(() => LastPlaySchema.parse({
      ...validLastPlay,
      claimedCount: 4
    })).toThrow()
  })
})

describe('API Request Schemas', () => {
  it('should validate create game request', () => {
    expect(() => CreateGameRequestSchema.parse({
      playerName: 'TestPlayer'
    })).not.toThrow()
  })

  it('should validate join game request', () => {
    expect(() => JoinGameRequestSchema.parse({
      playerName: 'TestPlayer'
    })).not.toThrow()
  })

  it('should validate start game request', () => {
    expect(() => StartGameRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000'
    })).not.toThrow()
  })

  it('should validate play cards request', () => {
    expect(() => PlayCardsRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      cardIndices: [0, 1, 2],
      declaredCard: 'ACE'
    })).not.toThrow()
  })

  it('should reject invalid card indices', () => {
    expect(() => PlayCardsRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      cardIndices: [0, 1, 2, 3, 4, 5], // Too many
      declaredCard: 'ACE'
    })).toThrow()

    expect(() => PlayCardsRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      cardIndices: [], // Empty array
      declaredCard: 'ACE'
    })).toThrow()

    expect(() => PlayCardsRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      cardIndices: [5], // Index out of range (0-4 for 5-card hand)
      declaredCard: 'ACE'
    })).toThrow()
  })

  it('should validate challenge request', () => {
    expect(() => ChallengeRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'liar'
    })).not.toThrow()

    expect(() => ChallengeRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'believe'
    })).not.toThrow()
  })

  it('should validate roulette request', () => {
    expect(() => RouletteRequestSchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000'
    })).not.toThrow()
  })

  it('should validate game state query parameters', () => {
    expect(() => GameStateQuerySchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000'
    })).not.toThrow()

    expect(() => GameStateQuerySchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      since: '42'
    })).not.toThrow()
  })

  it('should transform and validate since parameter', () => {
    const result = GameStateQuerySchema.parse({
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      since: '42'
    })
    expect(result.since).toBe(42)
    expect(typeof result.since).toBe('number')
  })
})