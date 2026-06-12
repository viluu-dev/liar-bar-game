/**
 * Tests for validation utility functions
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ValidationError,
  validateCreateGameRequest,
  validateJoinGameRequest,
  validateStartGameRequest,
  validatePlayCardsRequest,
  validateChallengeRequest,
  validateRouletteRequest,
  validateGameStateQuery,
  validateGameState,
  validateProjectedGameState,
  createValidationErrorResponse,
  withValidation
} from './validation-utils'
import { CreateGameRequestSchema } from './schemas'

describe('ValidationError', () => {
  it('should create error with issues', () => {
    const issues = [{
      code: 'invalid_type' as const,
      expected: 'string' as const,
      received: 'number' as const,
      path: ['name'] as (string | number)[],
      message: 'Expected string, received number'
    }]
    
    const error = new ValidationError('Test error', issues)
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('Test error')
    expect(error.issues).toBe(issues)
  })
})

describe('Request validation functions', () => {
  it('should validate create game request', () => {
    const validData = { playerName: 'TestPlayer' }
    expect(() => validateCreateGameRequest(validData)).not.toThrow()
    
    const result = validateCreateGameRequest(validData)
    expect(result.playerName).toBe('TestPlayer')
  })

  it('should throw ValidationError for invalid create game request', () => {
    expect(() => validateCreateGameRequest({ playerName: '' })).toThrow(ValidationError)
    expect(() => validateCreateGameRequest({})).toThrow(ValidationError)
  })

  it('should validate join game request', () => {
    const validData = { playerName: 'TestPlayer' }
    expect(() => validateJoinGameRequest(validData)).not.toThrow()
  })

  it('should validate start game request', () => {
    const validData = { playerId: '550e8400-e29b-41d4-a716-446655440000' }
    expect(() => validateStartGameRequest(validData)).not.toThrow()
  })

  it('should validate play cards request', () => {
    const validData = {
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      cardIndices: [0, 1],
      declaredCard: 'ACE' as const
    }
    expect(() => validatePlayCardsRequest(validData)).not.toThrow()
  })

  it('should validate challenge request', () => {
    const validData = {
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'liar' as const
    }
    expect(() => validateChallengeRequest(validData)).not.toThrow()
  })

  it('should validate roulette request', () => {
    const validData = { playerId: '550e8400-e29b-41d4-a716-446655440000' }
    expect(() => validateRouletteRequest(validData)).not.toThrow()
  })
})

describe('Query validation', () => {
  it('should validate game state query', () => {
    const validData = {
      playerId: '550e8400-e29b-41d4-a716-446655440000',
      since: '42'
    }
    const result = validateGameStateQuery(validData)
    expect(result.playerId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.since).toBe(42) // Should be transformed to number
  })

  it('should validate game state query without since parameter', () => {
    const validData = {
      playerId: '550e8400-e29b-41d4-a716-446655440000'
    }
    const result = validateGameStateQuery(validData)
    expect(result.since).toBeUndefined()
  })
})

describe('Game state validation', () => {
  const validGameState = {
    status: 'lobby' as const,
    players: [],
    deck: [],
    tableCard: null,
    pile: [],
    pileCount: 0,
    currentPlayerIndex: -1,
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerId: null,
    roundNumber: 1,
    winnerId: null,
    version: 0,
    createdAt: 1640995200000,
    updatedAt: 1640995200000
  }

  const validProjectedGameState = {
    status: 'lobby' as const,
    players: [],
    myHand: [],
    tableCard: null,
    pileCount: 0,
    currentPlayerIndex: -1,
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerId: null,
    roundNumber: 1,
    winnerId: null,
    version: 0
  }

  it('should validate game state', () => {
    expect(() => validateGameState(validGameState)).not.toThrow()
  })

  it('should validate projected game state', () => {
    expect(() => validateProjectedGameState(validProjectedGameState)).not.toThrow()
  })

  it('should throw ValidationError for invalid game state', () => {
    const invalidGameState = { ...validGameState, status: 'invalid' }
    expect(() => validateGameState(invalidGameState)).toThrow(ValidationError)
  })
})

describe('Error response creation', () => {
  it('should create standardized error response', () => {
    const issues = [{
      code: 'invalid_type' as const,
      expected: 'string' as const,
      received: 'number' as const,
      path: ['playerName'] as (string | number)[],
      message: 'Expected string, received number'
    }]
    
    const error = new ValidationError('Validation failed', issues)
    const response = createValidationErrorResponse(error)
    
    expect(response.error).toBe('Validation failed')
    expect(response.message).toBe('Validation failed')
    expect(response.issues).toHaveLength(1)
    expect(response.issues[0].path).toBe('playerName')
    expect(response.issues[0].message).toBe('Expected string, received number')
  })
})

describe('withValidation wrapper', () => {
  it('should call handler with valid data', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('success'))
    const wrappedHandler = withValidation(CreateGameRequestSchema, handler)
    
    const validData = { playerName: 'TestPlayer' }
    await wrappedHandler(validData)
    
    expect(handler).toHaveBeenCalledWith(validData)
  })

  it('should return 400 response for invalid data', async () => {
    const handler = vi.fn()
    const wrappedHandler = withValidation(CreateGameRequestSchema, handler)
    
    const invalidData = { playerName: '' }
    const response = await wrappedHandler(invalidData)
    
    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
    
    const responseBody = await response.json()
    expect(responseBody.error).toBe('Validation failed')
  })

  it('should re-throw non-validation errors', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Other error'))
    const wrappedHandler = withValidation(CreateGameRequestSchema, handler)
    
    const validData = { playerName: 'TestPlayer' }
    await expect(wrappedHandler(validData)).rejects.toThrow('Other error')
  })
})