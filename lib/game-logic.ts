/**
 * Game logic functions for Liar's Bar
 * Handles card dealing, deck management, and game mechanics
 */

import { Card, TableCard, DealResult, ChallengeResult } from './types'
import { MIN_PLAYERS, MAX_PLAYERS } from './constants'

/**
 * Returns the per-rank card counts for a deck sized for `playerCount` players.
 * Preserves the same Ace:King:Queen:Joker ratio (3:3:3:1) as the original
 * 4-player deck (6/6/6/2) at every table size, scaling up or down so each
 * player can always be dealt a 5-card hand with a small (0-2 card) surplus.
 */
export function getDeckComposition(playerCount: number): { card: Card; count: number }[] {
  const perRank = Math.round(playerCount * 1.5)
  const jokers = Math.round(playerCount * 0.5)
  return [
    { card: 'ACE', count: perRank },
    { card: 'KING', count: perRank },
    { card: 'QUEEN', count: perRank },
    { card: 'JOKER', count: jokers },
  ]
}

/**
 * Creates a deck scaled for `playerCount` players (see getDeckComposition).
 */
export function createDeckForPlayerCount(playerCount: number): Card[] {
  const deck: Card[] = []
  for (const { card, count } of getDeckComposition(playerCount)) {
    for (let i = 0; i < count; i++) {
      deck.push(card)
    }
  }
  return deck
}

/**
 * Creates the canonical 4-player, 20-card deck for Liar's Bar
 * Contains: 6 Aces, 6 Kings, 6 Queens, 2 Jokers
 *
 * Requirements: 3.1 - Game shall shuffle a 20-card deck and deal 5 cards to each player
 */
export function createInitialDeck(): Card[] {
  return createDeckForPlayerCount(4)
}

/**
 * Fisher-Yates shuffle for any array. Uses crypto.getRandomValues for true randomness.
 * Does not mutate the original array.
 */
export function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomArray = new Uint32Array(1)
    crypto.getRandomValues(randomArray)
    const j = randomArray[0] % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

/**
 * Shuffles a deck using the Fisher-Yates algorithm
 * Uses crypto.getRandomValues for true randomness
 * 
 * Requirements: 3.1 - System shall shuffle deck properly
 * 
 * @param deck Array of cards to shuffle
 * @returns New shuffled array (does not mutate original)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  return shuffleArray(deck)
}

/**
 * Deals 5 cards to each player from the deck
 * 
 * Requirements: 3.1 - Deal 5 cards to each player
 * 
 * @param deck Shuffled deck to deal from
 * @param playerCount Number of players (2-8)
 * @returns Object containing player hands and remaining deck
 */
export function dealCards(deck: Card[], playerCount: number): DealResult {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`)
  }
  
  if (deck.length < playerCount * 5) {
    throw new Error('Not enough cards in deck to deal 5 cards per player')
  }
  
  const playerHands: Card[][] = []
  let deckIndex = 0
  
  // Deal 5 cards to each player
  for (let player = 0; player < playerCount; player++) {
    const hand: Card[] = []
    for (let card = 0; card < 5; card++) {
      hand.push(deck[deckIndex])
      deckIndex++
    }
    playerHands.push(hand)
  }
  
  // Return remaining cards in deck
  const remainingDeck = deck.slice(deckIndex)
  
  return {
    playerHands,
    remainingDeck
  }
}

/**
 * Randomly selects a Table Card for the round
 * Only Ace, King, or Queen can be Table Cards (no Jokers)
 * 
 * Requirements: 3.3 - System shall randomly select and display a Table Card (Ace, King, or Queen)
 * 
 * @returns Randomly selected TableCard
 */
export function selectTableCard(): TableCard {
  const tableCards: TableCard[] = ['ACE', 'KING', 'QUEEN']
  
  // Generate cryptographically secure random index
  const randomArray = new Uint32Array(1)
  crypto.getRandomValues(randomArray)
  const index = randomArray[0] % tableCards.length
  
  return tableCards[index]
}

/**
 * Returns an updated game state with the inactive player's turn skipped,
 * or null if no skip is needed.
 * - playing: advance currentPlayerIndex to next alive non-safe player
 * - challenge: auto-believe (challenger becomes current player, skip if safe)
 *
 * @param state Current authoritative game state
 * @param now Current timestamp in ms (injected for testability)
 * @param inactiveThresholdMs How long a player can be inactive before being skipped
 */
export function autoSkipIfInactive(
  state: { status: string; players: { id: string; isAlive: boolean; isSafe: boolean; lastSeenAt: number }[]; currentPlayerIndex: number; challengerIndex: number | null; lastPlay: unknown; version: number; updatedAt: number },
  now: number,
  inactiveThresholdMs = 90_000
): typeof state | null {
  if (state.status === 'playing' && state.currentPlayerIndex >= 0) {
    const current = state.players[state.currentPlayerIndex]
    if (current?.isAlive && now - current.lastSeenAt > inactiveThresholdMs) {
      const nextIdx = getNextAlivePlayerIndex(state.players, state.currentPlayerIndex, true)
      if (nextIdx === null) return null
      return { ...state, currentPlayerIndex: nextIdx, version: state.version + 1, updatedAt: now }
    }
  }

  if (state.status === 'challenge' && state.challengerIndex !== null) {
    const challenger = state.players[state.challengerIndex]
    if (challenger?.isAlive && now - challenger.lastSeenAt > inactiveThresholdMs) {
      // Auto-believe: skip safe challengers to next non-safe alive player
      const nextIdx = challenger.isSafe
        ? (getNextAlivePlayerIndex(state.players, state.challengerIndex, true) ?? state.challengerIndex)
        : state.challengerIndex
      return {
        ...state,
        status: 'playing',
        currentPlayerIndex: nextIdx,
        challengerIndex: null,
        lastPlay: null,
        version: state.version + 1,
        updatedAt: now,
      }
    }
  }

  return null
}

/**
 * Initialises a 6-slot revolver chamber with `bullets` live rounds at random positions.
 * Uses crypto.getRandomValues so the layout is unpredictable server-side.
 *
 * @param bullets Number of live rounds to load (1–6)
 */
export function initChamber(bullets: number): boolean[] {
  const chamber = new Array<boolean>(6).fill(false)
  // Fisher-Yates shuffle to pick `bullets` distinct positions
  const positions = [0, 1, 2, 3, 4, 5]
  for (let i = 5; i > 0; i--) {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const j = arr[0] % (i + 1)
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }
  for (let i = 0; i < bullets; i++) {
    chamber[positions[i]] = true
  }
  return chamber
}

/**
 * Resolves a "liar" challenge by checking the played cards against the table card.
 * Jokers count as valid wildcards for any table card.
 *
 * @param cards Actual cards that were played (from lastPlay.cards)
 * @param tableCard The declared table card for this round
 * @returns ChallengeResult with isValid flag and list of invalid cards
 */
export function resolveChallenge(cards: Card[], tableCard: TableCard): ChallengeResult {
  const invalidCards = cards.filter(c => c !== tableCard && c !== 'JOKER')
  return {
    isValid: invalidCards.length === 0,
    invalidCards,
  }
}

/**
 * Finds the next player index that is alive (and optionally non-safe) after the given index.
 * Wraps around circularly. Returns null if no qualifying player exists.
 *
 * @param players Array of players
 * @param fromIndex Index of the player whose turn just ended
 * @param skipSafe When true, also skip safe players (used for currentPlayerIndex advancement)
 */
export function getNextAlivePlayerIndex(
  players: { isAlive: boolean; isSafe: boolean }[],
  fromIndex: number,
  skipSafe: boolean = false
): number | null {
  const count = players.length
  for (let i = 1; i < count; i++) {
    const idx = (fromIndex + i) % count
    const p = players[idx]
    if (!p.isAlive) continue
    if (skipSafe && p.isSafe) continue
    return idx
  }
  return null
}

/**
 * Validates that the specified card indices exist in the player's hand
 * and that 1-3 cards are selected
 *
 * @param hand Player's current hand
 * @param cardIndices Array of indices to validate
 * @returns true if all indices are valid and count is 1-3
 */
export function validatePlay(hand: Card[], cardIndices: number[]): boolean {
  // Must select 1-3 cards
  if (cardIndices.length < 1 || cardIndices.length > 3) {
    return false
  }
  
  // All indices must be valid
  for (const index of cardIndices) {
    if (index < 0 || index >= hand.length) {
      return false
    }
  }
  
  // No duplicate indices
  const uniqueIndices = new Set(cardIndices)
  if (uniqueIndices.size !== cardIndices.length) {
    return false
  }
  
  return true
}