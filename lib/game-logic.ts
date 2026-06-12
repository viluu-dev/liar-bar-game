/**
 * Game logic functions for Liar's Bar
 * Handles card dealing, deck management, and game mechanics
 */

import { Card, TableCard, DealResult } from './types'

/**
 * Creates the initial 20-card deck for Liar's Bar
 * Contains: 6 Aces, 6 Kings, 6 Queens, 2 Jokers
 * 
 * Requirements: 3.1 - Game shall shuffle a 20-card deck and deal 5 cards to each player
 */
export function createInitialDeck(): Card[] {
  const deck: Card[] = []
  
  // Add 6 Aces
  for (let i = 0; i < 6; i++) {
    deck.push('ACE')
  }
  
  // Add 6 Kings
  for (let i = 0; i < 6; i++) {
    deck.push('KING')
  }
  
  // Add 6 Queens
  for (let i = 0; i < 6; i++) {
    deck.push('QUEEN')
  }
  
  // Add 2 Jokers
  for (let i = 0; i < 2; i++) {
    deck.push('JOKER')
  }
  
  return deck
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
  // Create a copy to avoid mutating the original
  const shuffled = [...deck]
  
  // Fisher-Yates shuffle algorithm
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Generate cryptographically secure random index
    const randomArray = new Uint32Array(1)
    crypto.getRandomValues(randomArray)
    const j = randomArray[0] % (i + 1)
    
    // Swap elements
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  
  return shuffled
}

/**
 * Deals 5 cards to each player from the deck
 * 
 * Requirements: 3.1 - Deal 5 cards to each player
 * 
 * @param deck Shuffled deck to deal from
 * @param playerCount Number of players (2-6)
 * @returns Object containing player hands and remaining deck
 */
export function dealCards(deck: Card[], playerCount: number): DealResult {
  if (playerCount < 2 || playerCount > 6) {
    throw new Error('Player count must be between 2 and 6')
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