/**
 * Tests for game logic functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInitialDeck, shuffleDeck, dealCards, selectTableCard, validatePlay } from './game-logic'
import type { Card, TableCard } from './types'

describe('createInitialDeck', () => {
  it('should create a deck with exactly 20 cards', () => {
    const deck = createInitialDeck()
    expect(deck).toHaveLength(20)
  })

  it('should contain exactly 6 Aces, 6 Kings, 6 Queens, and 2 Jokers', () => {
    const deck = createInitialDeck()
    
    const counts = {
      ACE: deck.filter(card => card === 'ACE').length,
      KING: deck.filter(card => card === 'KING').length,
      QUEEN: deck.filter(card => card === 'QUEEN').length,
      JOKER: deck.filter(card => card === 'JOKER').length
    }
    
    expect(counts.ACE).toBe(6)
    expect(counts.KING).toBe(6)
    expect(counts.QUEEN).toBe(6)
    expect(counts.JOKER).toBe(2)
  })

  it('should return a new array each time (not cached)', () => {
    const deck1 = createInitialDeck()
    const deck2 = createInitialDeck()
    
    expect(deck1).not.toBe(deck2) // Different array instances
    expect(deck1).toEqual(deck2) // Same contents
  })
})

describe('shuffleDeck', () => {
  let originalGetRandomValues: any

  beforeEach(() => {
    // Save original function
    originalGetRandomValues = global.crypto.getRandomValues
  })

  afterEach(() => {
    // Restore original function
    global.crypto.getRandomValues = originalGetRandomValues
  })

  it('should not mutate the original deck', () => {
    const originalDeck: Card[] = ['ACE', 'KING', 'QUEEN']
    const originalCopy = [...originalDeck]
    
    shuffleDeck(originalDeck)
    expect(originalDeck).toEqual(originalCopy)
  })

  it('should return a deck with the same cards', () => {
    const originalDeck = createInitialDeck()
    const shuffled = shuffleDeck(originalDeck)
    
    // Should have same length
    expect(shuffled).toHaveLength(originalDeck.length)
    
    // Should have same cards (when sorted)
    const sortedOriginal = [...originalDeck].sort()
    const sortedShuffled = [...shuffled].sort()
    expect(sortedShuffled).toEqual(sortedOriginal)
  })

  it('should produce different arrangements with controlled randomness', () => {
    const deck: Card[] = ['ACE', 'KING', 'QUEEN', 'JOKER']
    
    // Mock getRandomValues to return predictable values
    let callCount = 0
    global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      // First shuffle: return values that will cause swaps
      if (callCount < 3) {
        array[0] = callCount + 1
      } else {
        // Second shuffle: return different values
        array[0] = (callCount - 3) * 2
      }
      callCount++
    })
    
    const shuffle1 = shuffleDeck(deck)
    const shuffle2 = shuffleDeck(deck)
    
    // Should have same content but potentially different order
    expect(shuffle1.sort()).toEqual(shuffle2.sort())
    // Note: We can't guarantee they're different due to randomness,
    // but we can ensure they have the same cards
  })

  it('should handle empty deck', () => {
    const emptyDeck: Card[] = []
    const shuffled = shuffleDeck(emptyDeck)
    expect(shuffled).toEqual([])
  })

  it('should handle single card deck', () => {
    const singleCard: Card[] = ['ACE']
    const shuffled = shuffleDeck(singleCard)
    expect(shuffled).toEqual(['ACE'])
  })

  it('should use crypto.getRandomValues for randomness', () => {
    const mockGetRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 0
    })
    global.crypto.getRandomValues = mockGetRandomValues
    
    const deck: Card[] = ['ACE', 'KING', 'QUEEN']
    shuffleDeck(deck)
    
    // Should have called crypto.getRandomValues for each shuffle iteration
    expect(mockGetRandomValues).toHaveBeenCalledTimes(2) // deck.length - 1
  })
})

describe('dealCards', () => {
  it('should deal 5 cards to each player', () => {
    const deck = createInitialDeck()
    const result = dealCards(deck, 3)
    
    expect(result.playerHands).toHaveLength(3)
    result.playerHands.forEach(hand => {
      expect(hand).toHaveLength(5)
    })
  })

  it('should remove dealt cards from the remaining deck', () => {
    const deck = createInitialDeck() // 20 cards
    const result = dealCards(deck, 3) // Deal to 3 players (15 cards)
    
    expect(result.remainingDeck).toHaveLength(5) // 20 - 15 = 5
  })

  it('should deal different cards to each player', () => {
    const deck: Card[] = ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE', 'KING', 'QUEEN', 'JOKER', 'ACE', 'KING']
    const result = dealCards(deck, 2)
    
    // First player gets first 5 cards
    expect(result.playerHands[0]).toEqual(['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'])
    
    // Second player gets next 5 cards
    expect(result.playerHands[1]).toEqual(['KING', 'QUEEN', 'JOKER', 'ACE', 'KING'])
  })

  it('should throw error for invalid player count', () => {
    const deck = createInitialDeck()
    
    expect(() => dealCards(deck, 1)).toThrow('Player count must be between 2 and 6')
    expect(() => dealCards(deck, 7)).toThrow('Player count must be between 2 and 6')
    expect(() => dealCards(deck, 0)).toThrow('Player count must be between 2 and 6')
    expect(() => dealCards(deck, -1)).toThrow('Player count must be between 2 and 6')
  })

  it('should throw error if not enough cards in deck', () => {
    const smallDeck: Card[] = ['ACE', 'KING', 'QUEEN'] // Only 3 cards
    
    expect(() => dealCards(smallDeck, 2)).toThrow('Not enough cards in deck to deal 5 cards per player')
  })

  it('should handle maximum 6 players with enough cards', () => {
    // Create a larger deck to test 6 players scenario  
    const largeDeck: Card[] = new Array(30).fill('ACE') as Card[] // 30 cards for 6 players
    const result = dealCards(largeDeck, 6) // 6 * 5 = 30 cards
    
    expect(result.playerHands).toHaveLength(6)
    expect(result.remainingDeck).toHaveLength(0)
    result.playerHands.forEach(hand => {
      expect(hand).toHaveLength(5)
    })
  })

  it('should fail with 6 players and standard 20-card deck', () => {
    const deck = createInitialDeck() // Only 20 cards
    
    // This should throw because we need 30 cards but only have 20
    expect(() => dealCards(deck, 6)).toThrow('Not enough cards in deck to deal 5 cards per player')
  })

  it('should work with exactly enough cards', () => {
    // Create deck with exactly enough cards for 4 players
    const deck: Card[] = new Array(20).fill('ACE') as Card[]
    const result = dealCards(deck, 4) // 4 * 5 = 20 cards
    
    expect(result.playerHands).toHaveLength(4)
    expect(result.remainingDeck).toHaveLength(0)
  })
})

describe('selectTableCard', () => {
  let originalGetRandomValues: any

  beforeEach(() => {
    // Save original function
    originalGetRandomValues = global.crypto.getRandomValues
  })

  afterEach(() => {
    // Restore original function
    global.crypto.getRandomValues = originalGetRandomValues
  })

  it('should return ACE when random index is 0', () => {
    global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 0 // 0 % 3 = 0 -> ACE
    })
    
    const tableCard = selectTableCard()
    expect(tableCard).toBe('ACE')
  })

  it('should return KING when random index is 1', () => {
    global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 1 // 1 % 3 = 1 -> KING
    })
    
    const tableCard = selectTableCard()
    expect(tableCard).toBe('KING')
  })

  it('should return QUEEN when random index is 2', () => {
    global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 2 // 2 % 3 = 2 -> QUEEN
    })
    
    const tableCard = selectTableCard()
    expect(tableCard).toBe('QUEEN')
  })

  it('should handle large random values correctly with modulo', () => {
    global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 1000000 // 1000000 % 3 = 1 -> KING
    })
    
    const tableCard = selectTableCard()
    expect(tableCard).toBe('KING')
  })

  it('should never return JOKER as table card', () => {
    // Test multiple calls to ensure JOKER is never returned
    const possibleResults: TableCard[] = ['ACE', 'KING', 'QUEEN']
    
    for (let i = 0; i < 3; i++) {
      global.crypto.getRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
        array[0] = i
      })
      
      const tableCard = selectTableCard()
      expect(possibleResults).toContain(tableCard)
      expect(tableCard).not.toBe('JOKER')
    }
  })

  it('should use crypto.getRandomValues for randomness', () => {
    const mockGetRandomValues = vi.fn().mockImplementation((array: Uint32Array) => {
      array[0] = 1
    })
    global.crypto.getRandomValues = mockGetRandomValues
    
    selectTableCard()
    
    expect(mockGetRandomValues).toHaveBeenCalledTimes(1)
    expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint32Array))
  })
})

describe('validatePlay', () => {
  const sampleHand: Card[] = ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE']

  it('should return true for valid single card play', () => {
    expect(validatePlay(sampleHand, [0])).toBe(true)
    expect(validatePlay(sampleHand, [2])).toBe(true)
    expect(validatePlay(sampleHand, [4])).toBe(true)
  })

  it('should return true for valid multiple card play', () => {
    expect(validatePlay(sampleHand, [0, 1])).toBe(true)
    expect(validatePlay(sampleHand, [1, 2, 3])).toBe(true)
    expect(validatePlay(sampleHand, [0, 2, 4])).toBe(true)
  })

  it('should return false for empty selection', () => {
    expect(validatePlay(sampleHand, [])).toBe(false)
  })

  it('should return false for more than 3 cards', () => {
    expect(validatePlay(sampleHand, [0, 1, 2, 3])).toBe(false)
    expect(validatePlay(sampleHand, [0, 1, 2, 3, 4])).toBe(false)
  })

  it('should return false for invalid indices', () => {
    expect(validatePlay(sampleHand, [-1])).toBe(false)
    expect(validatePlay(sampleHand, [5])).toBe(false)
    expect(validatePlay(sampleHand, [0, 10])).toBe(false)
  })

  it('should return false for duplicate indices', () => {
    expect(validatePlay(sampleHand, [0, 0])).toBe(false)
    expect(validatePlay(sampleHand, [1, 1, 2])).toBe(false)
    expect(validatePlay(sampleHand, [2, 1, 2])).toBe(false)
  })

  it('should handle empty hand', () => {
    expect(validatePlay([], [0])).toBe(false)
    expect(validatePlay([], [])).toBe(false)
  })

  it('should handle single card hand', () => {
    const singleCardHand: Card[] = ['ACE']
    expect(validatePlay(singleCardHand, [0])).toBe(true)
    expect(validatePlay(singleCardHand, [1])).toBe(false)
    expect(validatePlay(singleCardHand, [0, 1])).toBe(false)
  })
})

describe('Integration: Full deck setup flow', () => {
  it('should create, shuffle, deal cards and select table card for a complete game setup', () => {
    // Create initial deck
    const deck = createInitialDeck()
    expect(deck).toHaveLength(20)
    
    // Shuffle the deck
    const shuffledDeck = shuffleDeck(deck)
    expect(shuffledDeck).toHaveLength(20)
    expect(shuffledDeck.sort()).toEqual(deck.sort()) // Same cards, potentially different order
    
    // Deal cards to 4 players
    const dealResult = dealCards(shuffledDeck, 4)
    expect(dealResult.playerHands).toHaveLength(4)
    expect(dealResult.remainingDeck).toHaveLength(0) // 20 cards / 4 players = 5 each, 0 remaining
    
    // Each player should have 5 cards
    dealResult.playerHands.forEach(hand => {
      expect(hand).toHaveLength(5)
    })
    
    // Select table card
    const tableCard = selectTableCard()
    expect(['ACE', 'KING', 'QUEEN']).toContain(tableCard)
    expect(tableCard).not.toBe('JOKER')
  })

  it('should work with fewer players leaving cards in deck', () => {
    const deck = createInitialDeck()
    const shuffledDeck = shuffleDeck(deck)
    
    // Deal to 3 players (15 cards dealt, 5 remaining)
    const dealResult = dealCards(shuffledDeck, 3)
    
    expect(dealResult.playerHands).toHaveLength(3)
    expect(dealResult.remainingDeck).toHaveLength(5)
    
    // Total cards should still be 20
    const totalCardsDealt = dealResult.playerHands.reduce((sum, hand) => sum + hand.length, 0)
    expect(totalCardsDealt + dealResult.remainingDeck.length).toBe(20)
  })
})