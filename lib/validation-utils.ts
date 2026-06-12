/**
 * Validation utility functions using Zod schemas
 * Provides helper functions for API endpoints and game logic
 */

import { z } from 'zod'
import {
  CreateGameRequestSchema,
  JoinGameRequestSchema,
  StartGameRequestSchema,
  PlayCardsRequestSchema,
  ChallengeRequestSchema,
  RouletteRequestSchema,
  GameStateQuerySchema,
  GameStateSchema,
  ProjectedGameStateSchema,
  type CreateGameRequest,
  type JoinGameRequest,
  type StartGameRequest,
  type PlayCardsRequest,
  type ChallengeRequest,
  type RouletteRequest,
  type GameStateQuery,
  type GameState,
  type ProjectedGameState
} from './schemas'

/**
 * Validation error with detailed information
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Safely parse and validate API request bodies
 */
export function validateCreateGameRequest(data: unknown): CreateGameRequest {
  const result = CreateGameRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid create game request', result.error.issues)
  }
  return result.data
}

export function validateJoinGameRequest(data: unknown): JoinGameRequest {
  const result = JoinGameRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid join game request', result.error.issues)
  }
  return result.data
}

export function validateStartGameRequest(data: unknown): StartGameRequest {
  const result = StartGameRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid start game request', result.error.issues)
  }
  return result.data
}

export function validatePlayCardsRequest(data: unknown): PlayCardsRequest {
  const result = PlayCardsRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid play cards request', result.error.issues)
  }
  return result.data
}

export function validateChallengeRequest(data: unknown): ChallengeRequest {
  const result = ChallengeRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid challenge request', result.error.issues)
  }
  return result.data
}

export function validateRouletteRequest(data: unknown): RouletteRequest {
  const result = RouletteRequestSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid roulette request', result.error.issues)
  }
  return result.data
}

/**
 * Safely parse and validate query parameters
 */
export function validateGameStateQuery(params: unknown): GameStateQuery {
  const result = GameStateQuerySchema.safeParse(params)
  if (!result.success) {
    throw new ValidationError('Invalid game state query parameters', result.error.issues)
  }
  return result.data
}

/**
 * Validate game state data (e.g., when loading from Redis)
 */
export function validateGameState(data: unknown): GameState {
  const result = GameStateSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid game state data', result.error.issues)
  }
  return result.data
}

/**
 * Validate projected game state before sending to clients
 */
export function validateProjectedGameState(data: unknown): ProjectedGameState {
  const result = ProjectedGameStateSchema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid projected game state data', result.error.issues)
  }
  return result.data
}

/**
 * Create a standardized error response for validation failures
 */
export function createValidationErrorResponse(error: ValidationError) {
  return {
    error: 'Validation failed',
    message: error.message,
    issues: error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }))
  }
}

/**
 * Middleware-style validation wrapper for API routes
 */
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (validData: T) => Promise<Response> | Response
) {
  return async (data: unknown): Promise<Response> => {
    try {
      const validData = schema.parse(data)
      return await handler(validData)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Request validation failed', error.issues)
        return new Response(
          JSON.stringify(createValidationErrorResponse(validationError)),
          { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          }
        )
      }
      throw error
    }
  }
}