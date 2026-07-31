/**
 * Tests for game logic functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInitialDeck, createDeckForPlayerCount, getDeckComposition, shuffleDeck, dealCards, selectTableCard, validatePlay, getNextAlivePlayerIndex, resolveChallenge, autoSkipIfInactive, isSoloOnlyViolation } from './game-logic'
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

describe('getDeckComposition / createDeckForPlayerCount', () => {
  it('matches the canonical 6/6/6/2 composition at 4 players', () => {
    const composition = getDeckComposition(4)
    const counts = Object.fromEntries(composition.map(c => [c.card, c.count]))

    expect(counts.ACE).toBe(6)
    expect(counts.KING).toBe(6)
    expect(counts.QUEEN).toBe(6)
    expect(counts.JOKER).toBe(2)
    expect(createDeckForPlayerCount(4)).toHaveLength(20)
  })

  it('never produces a deck smaller than 5 cards per player, for every supported player count', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      const deck = createDeckForPlayerCount(playerCount)
      const surplus = deck.length - playerCount * 5

      expect(deck.length).toBeGreaterThanOrEqual(playerCount * 5)
      expect([0, 2]).toContain(surplus)
    }
  })

  it('keeps Ace, King, and Queen counts equal at every player count (preserves ratio)', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      const composition = getDeckComposition(playerCount)
      const counts = Object.fromEntries(composition.map(c => [c.card, c.count]))

      expect(counts.ACE).toBe(counts.KING)
      expect(counts.KING).toBe(counts.QUEEN)
      expect(counts.JOKER).toBeLessThan(counts.ACE)
    }
  })

  it('createDeckForPlayerCount total length matches the sum of getDeckComposition counts', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      const composition = getDeckComposition(playerCount)
      const total = composition.reduce((sum, c) => sum + c.count, 0)

      expect(createDeckForPlayerCount(playerCount)).toHaveLength(total)
    }
  })

  it('does not include a Devil Card when devilMode is false (default)', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      expect(getDeckComposition(playerCount).find(c => c.card === 'DEVIL')).toBeUndefined()
      expect(createDeckForPlayerCount(playerCount)).not.toContain('DEVIL')
    }
  })

  it('includes exactly one Devil Card when devilMode is true, regardless of player count', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      const composition = getDeckComposition(playerCount, true)
      expect(composition.find(c => c.card === 'DEVIL')?.count).toBe(1)
      expect(createDeckForPlayerCount(playerCount, true).filter(c => c === 'DEVIL')).toHaveLength(1)
    }
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

    expect(() => dealCards(deck, 1)).toThrow('Player count must be between 2 and 8')
    expect(() => dealCards(deck, 9)).toThrow('Player count must be between 2 and 8')
    expect(() => dealCards(deck, 0)).toThrow('Player count must be between 2 and 8')
    expect(() => dealCards(deck, -1)).toThrow('Player count must be between 2 and 8')
  })

  it('should throw error if not enough cards in deck', () => {
    const smallDeck: Card[] = ['ACE', 'KING', 'QUEEN'] // Only 3 cards

    expect(() => dealCards(smallDeck, 2)).toThrow('Not enough cards in deck to deal 5 cards per player')
  })

  it('should handle maximum 8 players with enough cards', () => {
    // Create a larger deck to test 8 players scenario
    const largeDeck: Card[] = new Array(40).fill('ACE') as Card[] // 40 cards for 8 players
    const result = dealCards(largeDeck, 8) // 8 * 5 = 40 cards

    expect(result.playerHands).toHaveLength(8)
    expect(result.remainingDeck).toHaveLength(0)
    result.playerHands.forEach(hand => {
      expect(hand).toHaveLength(5)
    })
  })

  it('should succeed with 6 players using a deck scaled for 6 players', () => {
    const deck = createDeckForPlayerCount(6) // 30 cards, scaled for 6 players

    const result = dealCards(deck, 6)
    expect(result.playerHands).toHaveLength(6)
    expect(result.remainingDeck).toHaveLength(0)
    result.playerHands.forEach(hand => {
      expect(hand).toHaveLength(5)
    })
  })

  it('should work with exactly enough cards', () => {
    // Create deck with exactly enough cards for 4 players
    const deck: Card[] = new Array(20).fill('ACE') as Card[]
    const result = dealCards(deck, 4) // 4 * 5 = 20 cards

    expect(result.playerHands).toHaveLength(4)
    expect(result.remainingDeck).toHaveLength(0)
  })

  describe('guaranteed Devil Card delivery', () => {
    it('always deals the Devil Card to a player, never leaves it in the remaining deck', () => {
      for (let playerCount = 2; playerCount <= 8; playerCount++) {
        for (let trial = 0; trial < 20; trial++) {
          const deck = shuffleDeck(createDeckForPlayerCount(playerCount, true))
          const result = dealCards(deck, playerCount)

          expect(result.remainingDeck).not.toContain('DEVIL')
          const devilCount = result.playerHands.reduce(
            (sum, hand) => sum + hand.filter(c => c === 'DEVIL').length,
            0
          )
          expect(devilCount).toBe(1)
        }
      }
    })

    it('is a no-op when the Devil Card is not present in the deck', () => {
      const deck = createInitialDeck() // no DEVIL in a devilMode-off deck
      const result = dealCards(deck, 4)
      expect(result.remainingDeck).not.toContain('DEVIL')
      expect(result.playerHands.flat()).not.toContain('DEVIL')
    })
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

describe('autoSkipIfInactive', () => {
  const NOW = 1_000_000
  const THRESHOLD = 90_000
  const STALE = NOW - THRESHOLD - 1  // just over threshold
  const FRESH = NOW - 10_000          // well within threshold

  const p = (id: string, lastSeenAt: number, opts: { isAlive?: boolean; isSafe?: boolean } = {}) => ({
    id, isAlive: opts.isAlive ?? true, isSafe: opts.isSafe ?? false, lastSeenAt,
  })

  const baseState = {
    version: 5,
    updatedAt: 900_000,
    lastPlay: null,
  }

  describe('playing status', () => {
    it('returns null when current player is active', () => {
      const state = { ...baseState, status: 'playing', currentPlayerIndex: 0, challengerIndex: null,
        players: [p('A', FRESH), p('B', STALE)] }
      expect(autoSkipIfInactive(state, NOW, THRESHOLD)).toBeNull()
    })

    it('skips inactive current player to next alive non-safe', () => {
      const state = { ...baseState, status: 'playing', currentPlayerIndex: 0, challengerIndex: null,
        players: [p('A', STALE), p('B', FRESH)] }
      const result = autoSkipIfInactive(state, NOW, THRESHOLD)
      expect(result?.currentPlayerIndex).toBe(1)
      expect(result?.version).toBe(6)
    })

    it('returns null when no next non-safe alive player', () => {
      const state = { ...baseState, status: 'playing', currentPlayerIndex: 0, challengerIndex: null,
        players: [p('A', STALE)] }
      expect(autoSkipIfInactive(state, NOW, THRESHOLD)).toBeNull()
    })
  })

  describe('challenge status', () => {
    it('returns null when challenger is active', () => {
      const state = { ...baseState, status: 'challenge', currentPlayerIndex: 0, challengerIndex: 1,
        players: [p('A', STALE), p('B', FRESH)] }
      expect(autoSkipIfInactive(state, NOW, THRESHOLD)).toBeNull()
    })

    it('auto-believes when challenger is inactive (transitions to playing)', () => {
      const state = { ...baseState, status: 'challenge', currentPlayerIndex: 0, challengerIndex: 1,
        players: [p('A', FRESH), p('B', STALE)] }
      const result = autoSkipIfInactive(state, NOW, THRESHOLD)
      expect(result?.status).toBe('playing')
      expect(result?.currentPlayerIndex).toBe(1) // challenger becomes current
      expect(result?.challengerIndex).toBeNull()
      expect(result?.lastPlay).toBeNull()
    })

    it('skips safe inactive challenger to next non-safe player', () => {
      const state = { ...baseState, status: 'challenge', currentPlayerIndex: 0, challengerIndex: 1,
        players: [p('A', FRESH), p('B', STALE, { isSafe: true }), p('C', FRESH)] }
      const result = autoSkipIfInactive(state, NOW, THRESHOLD)
      expect(result?.currentPlayerIndex).toBe(2)
    })
  })

  it('returns null for non-actionable statuses', () => {
    const state = { ...baseState, status: 'roulette', currentPlayerIndex: 0, challengerIndex: null,
      players: [p('A', STALE)] }
    expect(autoSkipIfInactive(state, NOW, THRESHOLD)).toBeNull()
  })
})

describe('resolveChallenge', () => {
  it('returns isValid=true when all cards match tableCard', () => {
    const result = resolveChallenge(['KING', 'KING', 'KING'], 'KING')
    expect(result.isValid).toBe(true)
    expect(result.invalidCards).toHaveLength(0)
  })

  it('returns isValid=true when all cards are Jokers', () => {
    const result = resolveChallenge(['JOKER', 'JOKER'], 'ACE')
    expect(result.isValid).toBe(true)
    expect(result.invalidCards).toHaveLength(0)
  })

  it('treats Jokers as wildcards alongside tableCard', () => {
    const result = resolveChallenge(['KING', 'JOKER'], 'KING')
    expect(result.isValid).toBe(true)
    expect(result.invalidCards).toHaveLength(0)
  })

  it('returns isValid=false when any card is invalid', () => {
    const result = resolveChallenge(['KING', 'ACE'], 'KING')
    expect(result.isValid).toBe(false)
    expect(result.invalidCards).toEqual(['ACE'])
  })

  it('returns all invalid cards when multiple are wrong', () => {
    const result = resolveChallenge(['ACE', 'QUEEN', 'ACE'], 'KING')
    expect(result.isValid).toBe(false)
    expect(result.invalidCards).toEqual(['ACE', 'QUEEN', 'ACE'])
  })

  it('returns isValid=false when none match and not Jokers', () => {
    const result = resolveChallenge(['ACE', 'QUEEN'], 'KING')
    expect(result.isValid).toBe(false)
    expect(result.invalidCards).toHaveLength(2)
  })

  it('handles single honest card', () => {
    const result = resolveChallenge(['ACE'], 'ACE')
    expect(result.isValid).toBe(true)
  })

  it('handles single dishonest card', () => {
    const result = resolveChallenge(['QUEEN'], 'ACE')
    expect(result.isValid).toBe(false)
    expect(result.invalidCards).toEqual(['QUEEN'])
  })

  it('treats a lone Devil Card as valid against any table card', () => {
    const result = resolveChallenge(['DEVIL'], 'KING')
    expect(result.isValid).toBe(true)
    expect(result.invalidCards).toHaveLength(0)
  })
})

describe('isSoloOnlyViolation', () => {
  it('returns false for a lone Devil Card', () => {
    expect(isSoloOnlyViolation(['DEVIL'])).toBe(false)
  })

  it('returns true when the Devil Card is combined with other cards', () => {
    expect(isSoloOnlyViolation(['DEVIL', 'ACE'])).toBe(true)
    expect(isSoloOnlyViolation(['KING', 'DEVIL', 'QUEEN'])).toBe(true)
  })

  it('returns false for normal multi-card plays without the Devil Card', () => {
    expect(isSoloOnlyViolation(['ACE', 'KING'])).toBe(false)
    expect(isSoloOnlyViolation(['JOKER', 'JOKER', 'JOKER'])).toBe(false)
  })
})

describe('getNextAlivePlayerIndex', () => {
  const alive = { isAlive: true, isSafe: false }
  const safe   = { isAlive: true, isSafe: true }
  const dead   = { isAlive: false, isSafe: false }

  it('returns next alive player', () => {
    expect(getNextAlivePlayerIndex([alive, alive, alive], 0)).toBe(1)
    expect(getNextAlivePlayerIndex([alive, alive, alive], 1)).toBe(2)
  })

  it('wraps around end of array', () => {
    expect(getNextAlivePlayerIndex([alive, alive, alive], 2)).toBe(0)
  })

  it('skips dead players', () => {
    expect(getNextAlivePlayerIndex([alive, dead, alive], 0)).toBe(2)
  })

  it('returns null when no other alive player exists', () => {
    expect(getNextAlivePlayerIndex([alive, dead, dead], 0)).toBeNull()
    expect(getNextAlivePlayerIndex([dead, dead, alive], 2)).toBeNull()
  })

  it('includes safe players when skipSafe=false (default)', () => {
    expect(getNextAlivePlayerIndex([alive, safe, alive], 0)).toBe(1)
  })

  it('skips safe players when skipSafe=true', () => {
    expect(getNextAlivePlayerIndex([alive, safe, alive], 0, true)).toBe(2)
  })

  it('skips both dead and safe when skipSafe=true', () => {
    expect(getNextAlivePlayerIndex([alive, dead, safe, alive], 0, true)).toBe(3)
  })

  it('returns null when all remaining are dead or safe (skipSafe=true)', () => {
    expect(getNextAlivePlayerIndex([alive, safe, safe], 0, true)).toBeNull()
  })

  it('handles single-player array', () => {
    expect(getNextAlivePlayerIndex([alive], 0)).toBeNull()
  })

  it('correctly skips fromIndex when wrapping', () => {
    // fromIndex=2 (last), next is index 0 (wraps)
    expect(getNextAlivePlayerIndex([alive, dead, alive], 2)).toBe(0)
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