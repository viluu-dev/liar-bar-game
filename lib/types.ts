/**
 * Core TypeScript types and interfaces for Liar's Bar game
 * Based on design specifications in .kiro/specs/liars-bar-game/design.md
 */

// Card type definitions
export type Card = 'ACE' | 'KING' | 'QUEEN' | 'JOKER'
export type TableCard = 'ACE' | 'KING' | 'QUEEN' // No Jokers as table cards

// Game status enum for state machine
export type GameStatus = 'lobby' | 'playing' | 'challenge' | 'roulette' | 'finished'

// Game settings shared by create/start requests and persisted game state
export interface GameSettings {
  bullets: number
  devilMode?: boolean
}

/**
 * Player interface - complete server-side player state
 * Contains private data that must be filtered in client projections
 */
export interface Player {
  id: string              // UUID, stable across reconnects
  name: string
  hand: Card[]            // Private - only visible to owner
  isAlive: boolean
  isSafe: boolean         // Emptied hand this round
  isHost: boolean
  joinedAt: number        // Unix timestamp
  lastSeenAt: number      // Updated on each poll/action
  chamber?: boolean[]     // Personal 6-slot cylinder, server-only
  chamberIndex?: number   // How many times this player has pulled
}

/**
 * Projected player interface for client-safe data
 * Strips private information like actual hand contents
 */
export interface ProjectedPlayer {
  id: string
  name: string
  handCount: number       // Length of hand, not actual cards
  isAlive: boolean
  isSafe: boolean
  isHost: boolean
  joinedAt: number
  lastSeenAt: number
  chamberIndex?: number   // Pulls taken (safe to expose; doesn't reveal bullet position)
}

/**
 * Last play information - tracks the most recent card play
 * Contains server-only data that's revealed during challenges
 */
export interface LastPlay {
  playerId: string
  playerName: string
  cards: Card[]           // Server-only, revealed during challenges
  claimedCount: number    // How many cards claimed
  claimedCard: TableCard  // What they claimed to play
  isDevilPlay: boolean    // Whether this play invoked the Devil Card effect
}

/**
 * Projected last play for client consumption
 * Omits actual cards until challenge reveal phase
 */
export interface ProjectedLastPlay {
  playerId: string
  playerName: string
  claimedCount: number
  claimedCard: TableCard
  cards?: Card[] // revealed only during roulette status
  isDevilPlay?: boolean // revealed only during roulette status, alongside cards
}
/**

 * Complete game state interface - server-side authoritative state
 * Contains all private data including deck and pile contents
 */
export interface GameState {
  status: GameStatus
  players: Player[]
  deck: Card[]                    // Server-only, never exposed
  tableCard: TableCard | null
  pile: Card[]                    // Server-only, never exposed
  pileCount: number               // Computed from pile.length
  currentPlayerIndex: number      // Index into players[]
  challengerIndex: number | null  // Who must challenge next
  lastPlay: LastPlay | null
  roulettePlayerIds: string[]     // Pending trigger-pullers (challenge loser, or every player but one on a Devil mass penalty)
  roulettePhaseStartedAt: number | null // Date.now() when status last transitioned into 'roulette'; anchors the visible countdown
  roundNumber: number
  winnerId: string | null
  version: number                 // Monotonically increasing
  createdAt: number
  updatedAt: number
  joinCode?: string
  settings?: GameSettings
  rematchPlayerIds?: string[] // players who clicked "Play Again"
  devilPlayerId: string | null    // Player currently holding this round's unspent Devil Card effect
  devilRank: TableCard | null     // Which rank (Ace/King/Queen) carries the Devil effect this round
}

/**
 * Projected game state for client consumption
 * Strips all private server data and includes only player-specific hand
 */
export interface ProjectedGameState {
  status: GameStatus
  players: ProjectedPlayer[]
  myHand: Card[]          // Only for requesting player
  tableCard: TableCard | null
  pileCount: number
  currentPlayerIndex: number
  challengerIndex: number | null
  lastPlay: ProjectedLastPlay | null
  roulettePlayerIds: string[]
  roulettePhaseStartedAt: number | null
  roundNumber: number
  winnerId: string | null
  version: number
  joinCode?: string
  settings?: GameSettings
  rematchPlayerIds?: string[] // players who clicked "Play Again"
  myDevilRank: TableCard | null // Set only if the requesting player holds this round's Devil Card
}

/**
 * API Response types for various endpoints
 */

// Game state polling response
export interface GameStateResponse {
  version: number
  changed: boolean
  gameState?: ProjectedGameState
  phase?: "none" // When no game exists
}

// Game creation response
export interface GameCreateResponse {
  playerId: string
  gameVersion: number
  joinCode?: string
}

// Game join response
export interface GameJoinResponse {
  playerId: string
}

// Standard action response
export interface GameActionResponse {
  success: boolean
  gameVersion: number
}

// Roulette specific response
export interface RouletteResponse extends GameActionResponse {
  result: "safe" | "eliminated"
}

/**
 * API Request body types
 */

export interface CreateGameRequest {
  playerName: string
  settings?: GameSettings
}

export interface JoinGameRequest {
  playerName: string
  joinCode?: string
}

export interface StartGameRequest {
  playerId: string
  joinCode: string
  bullets?: number
  devilMode?: boolean
}

export interface KickPlayerRequest {
  hostId: string
  targetId: string
  joinCode: string
}

export interface PlayCardsRequest {
  playerId: string
  joinCode: string
  cardIndices: number[]
  declaredCard: TableCard
}

export interface ChallengeRequest {
  playerId: string
  joinCode: string
  action: "liar" | "believe"
}

export interface RouletteRequest {
  playerId: string
  joinCode: string
}

/**
 * Utility types for game logic
 */

// Challenge resolution result
export interface ChallengeResult {
  isValid: boolean
  invalidCards: Card[]
}

// Card dealing result
export interface DealResult {
  playerHands: Card[][]
  remainingDeck: Card[]
}