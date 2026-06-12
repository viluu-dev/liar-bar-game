/**
 * Zod validation schemas for Liar's Bar game
 * Validates all API inputs and game state structures
 */

import { z } from 'zod'

// Card type schemas
export const CardSchema = z.enum(['ACE', 'KING', 'QUEEN', 'JOKER'])
export const TableCardSchema = z.enum(['ACE', 'KING', 'QUEEN'])
export const GameStatusSchema = z.enum(['lobby', 'playing', 'challenge', 'roulette', 'finished'])

// Player validation schema
export const PlayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).trim(),
  hand: z.array(CardSchema),
  isAlive: z.boolean(),
  isSafe: z.boolean(),
  isHost: z.boolean(),
  joinedAt: z.number().int().positive(),
  lastSeenAt: z.number().int().positive(),
  chamber: z.array(z.boolean()).length(6).optional(),      // server-only
  chamberIndex: z.number().int().min(0).max(5).optional(), // pulls taken this cylinder
})

// Projected player schema for client responses
export const ProjectedPlayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).trim(),
  handCount: z.number().int().min(0).max(5),
  isAlive: z.boolean(),
  isSafe: z.boolean(),
  isHost: z.boolean(),
  joinedAt: z.number().int().positive(),
  lastSeenAt: z.number().int().positive(),
  chamberIndex: z.number().int().min(0).max(5).optional(), // how many pulls taken (safe to expose)
})

// Last play validation schema
export const LastPlaySchema = z.object({
  playerId: z.string().uuid(),
  playerName: z.string().min(1).max(50).trim(),
  cards: z.array(CardSchema).min(1).max(3),
  claimedCount: z.number().int().min(1).max(3),
  claimedCard: TableCardSchema
})

// Projected last play schema for client responses
export const ProjectedLastPlaySchema = z.object({
  playerId: z.string().uuid(),
  playerName: z.string().min(1).max(50).trim(),
  claimedCount: z.number().int().min(1).max(3),
  claimedCard: TableCardSchema,
  cards: z.array(CardSchema).min(1).max(3).optional(),
})

// Complete game state validation schema
export const GameStateSchema = z.object({
  status: GameStatusSchema,
  players: z.array(PlayerSchema).min(0).max(6),
  deck: z.array(CardSchema),
  tableCard: TableCardSchema.nullable(),
  pile: z.array(CardSchema),
  pileCount: z.number().int().min(0),
  currentPlayerIndex: z.number().int().min(-1),
  challengerIndex: z.number().int().min(-1).nullable(),
  lastPlay: LastPlaySchema.nullable(),
  roulettePlayerId: z.string().uuid().nullable(),
  roundNumber: z.number().int().min(1),
  winnerId: z.string().uuid().nullable(),
  version: z.number().int().min(0),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  joinCode: z.string().length(4).optional(),
  settings: z.object({ bullets: z.number().int().min(1).max(6) }).optional(),
  rematchPlayerIds: z.array(z.string().uuid()).optional(),
})

// Projected game state schema for client responses
export const ProjectedGameStateSchema = z.object({
  status: GameStatusSchema,
  players: z.array(ProjectedPlayerSchema).min(0).max(6),
  myHand: z.array(CardSchema).max(5),
  tableCard: TableCardSchema.nullable(),
  pileCount: z.number().int().min(0),
  currentPlayerIndex: z.number().int().min(-1),
  challengerIndex: z.number().int().min(-1).nullable(),
  lastPlay: ProjectedLastPlaySchema.nullable(),
  roulettePlayerId: z.string().uuid().nullable(),
  roundNumber: z.number().int().min(1),
  winnerId: z.string().uuid().nullable(),
  version: z.number().int().min(0),
  joinCode: z.string().length(4).optional(),
  settings: z.object({ bullets: z.number().int().min(1).max(6) }).optional(),
  rematchPlayerIds: z.array(z.string().uuid()).optional(),
})

// API Request validation schemas

// Create game request
export const CreateGameRequestSchema = z.object({
  playerName: z.string().min(1).max(50).trim(),
  settings: z.object({ bullets: z.number().int().min(1).max(6) }).optional()
})

// Join game request
export const JoinGameRequestSchema = z.object({
  playerName: z.string().min(1).max(50).trim(),
  joinCode: z.string().optional()
})

// Start game request
export const StartGameRequestSchema = z.object({
  playerId: z.string().uuid(),
  joinCode: z.string().length(4),
  bullets: z.number().int().min(1).max(6).optional()
})

// Kick player request
export const KickPlayerRequestSchema = z.object({
  hostId: z.string().uuid(),
  targetId: z.string().uuid(),
  joinCode: z.string().length(4)
})

// Play cards request
export const PlayCardsRequestSchema = z.object({
  playerId: z.string().uuid(),
  joinCode: z.string().length(4),
  cardIndices: z.array(z.number().int().min(0).max(4)).min(1).max(3),
  declaredCard: TableCardSchema
})

// Challenge request
export const ChallengeRequestSchema = z.object({
  playerId: z.string().uuid(),
  joinCode: z.string().length(4),
  action: z.enum(['liar', 'believe'])
})

// Roulette request
export const RouletteRequestSchema = z.object({
  playerId: z.string().uuid(),
  joinCode: z.string().length(4)
})

// Rematch request
export const RematchRequestSchema = z.object({
  playerId: z.string().uuid(),
  joinCode: z.string().length(4)
})

// Game state polling query parameters
export const GameStateQuerySchema = z.object({
  playerId: z.string().uuid(),
  code: z.string().length(4),
  since: z.string().transform(Number).pipe(z.number().int().min(0)).optional()
})

// API Response validation schemas

// Game state response
export const GameStateResponseSchema = z.object({
  version: z.number().int().min(0),
  changed: z.boolean(),
  gameState: ProjectedGameStateSchema.optional(),
  phase: z.literal("none").optional()
})

// Game creation response
export const GameCreateResponseSchema = z.object({
  playerId: z.string().uuid(),
  gameVersion: z.number().int().min(0),
  joinCode: z.string().length(4).optional()
})

// Game join response
export const GameJoinResponseSchema = z.object({
  playerId: z.string().uuid()
})

// Standard action response
export const GameActionResponseSchema = z.object({
  success: z.boolean(),
  gameVersion: z.number().int().min(0)
})

// Roulette specific response
export const RouletteResponseSchema = GameActionResponseSchema.extend({
  result: z.enum(['safe', 'eliminated'])
})

// Type exports from schemas for use throughout the app
export type Card = z.infer<typeof CardSchema>
export type TableCard = z.infer<typeof TableCardSchema>
export type GameStatus = z.infer<typeof GameStatusSchema>
export type Player = z.infer<typeof PlayerSchema>
export type ProjectedPlayer = z.infer<typeof ProjectedPlayerSchema>
export type LastPlay = z.infer<typeof LastPlaySchema>
export type ProjectedLastPlay = z.infer<typeof ProjectedLastPlaySchema>
export type GameState = z.infer<typeof GameStateSchema>
export type ProjectedGameState = z.infer<typeof ProjectedGameStateSchema>
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>
export type JoinGameRequest = z.infer<typeof JoinGameRequestSchema>
export type StartGameRequest = z.infer<typeof StartGameRequestSchema>
export type PlayCardsRequest = z.infer<typeof PlayCardsRequestSchema>
export type ChallengeRequest = z.infer<typeof ChallengeRequestSchema>
export type RouletteRequest = z.infer<typeof RouletteRequestSchema>
export type GameStateQuery = z.infer<typeof GameStateQuerySchema>
export type GameStateResponse = z.infer<typeof GameStateResponseSchema>
export type GameCreateResponse = z.infer<typeof GameCreateResponseSchema>
export type GameJoinResponse = z.infer<typeof GameJoinResponseSchema>
export type GameActionResponse = z.infer<typeof GameActionResponseSchema>
export type RouletteResponse = z.infer<typeof RouletteResponseSchema>
export type KickPlayerRequest = z.infer<typeof KickPlayerRequestSchema>
export type RematchRequest = z.infer<typeof RematchRequestSchema>