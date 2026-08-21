/**
 * Game logic functions for Liar's Bar
 * Handles card dealing, deck management, and game mechanics
 */

import { Card, TableCard, DealResult, ChallengeResult, GameState } from './types'
import { MIN_PLAYERS, MAX_PLAYERS, ROULETTE_COUNTDOWN_MS } from './constants'

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
 * Jokers count as valid wildcards for any table card. A play that invokes the
 * Devil Card effect never reaches this function — it auto-fails the challenge
 * before resolveChallenge is called (see app/api/game/challenge/route.ts).
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
 * Determines whether a play automatically invokes the Devil Card effect:
 * the player must hold this game's Devil designation, and must play exactly
 * that flagged rank completely alone. Combining it with other cards (or
 * playing a different card) is just an ordinary play — there is no separate
 * opt-in, invoking is entirely a side effect of playing it solo
 * (docs/devil.card.md).
 */
export function isDevilCardPlay(
  devilPlayerId: string | null,
  devilRank: TableCard | null,
  playerId: string,
  cards: Card[]
): boolean {
  return playerId === devilPlayerId && devilRank !== null && cards.length === 1 && cards[0] === devilRank
}

/**
 * Randomly flags one dealt card as the Devil Card for the current round.
 * Called at game start and again on every round reset, each time against
 * that round's freshly dealt hands — any unplayed assignment from the
 * previous round is discarded (docs/devil.card.md). Only Ace, King, or
 * Queen are eligible (Jokers are already a universal wildcard, so stacking
 * the Devil effect on one would be redundant). Selection is uniform over
 * eligible card-slots (not over players), so a player holding more of the
 * flagged rank has proportionally better odds of holding it.
 *
 * @param hands Freshly dealt hands, indexed as returned by dealCards
 * @returns The hand index and rank chosen, or null if no hand holds an
 *          eligible card (unreachable in practice given deck ratios, but
 *          handled defensively rather than throwing)
 */
export function selectDevilCard(hands: Card[][]): { handIndex: number; rank: TableCard } | null {
  const eligible: { handIndex: number; rank: TableCard }[] = []
  hands.forEach((hand, handIndex) => {
    hand.forEach(card => {
      if (card === 'ACE' || card === 'KING' || card === 'QUEEN') {
        eligible.push({ handIndex, rank: card })
      }
    })
  })

  if (eligible.length === 0) {
    return null
  }

  const randomArray = new Uint32Array(1)
  crypto.getRandomValues(randomArray)
  const index = randomArray[0] % eligible.length

  return eligible[index]
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

/**
 * Applies a card play to `state` for the player at `playerIndex`, returning
 * the resulting game state. Pure — performs no I/O and mutates nothing.
 *
 * Assumes the caller (POST /api/game/play) has already resolved `playerIndex`
 * and validated turn-order/challenger-designation concerns specific to the
 * entry status (`playing` vs the collapsed `challenge`/believe path); this
 * function owns everything downstream of that: hand-index validation, Devil
 * Card detection, pile update, next-challenger computation, and the
 * roulette fallback when no eligible next challenger exists.
 *
 * @param state Current authoritative game state (or, for the collapsed
 *   challenge→play path, the believe-transitioned effective state)
 * @param playerIndex Index into state.players of the player making this play
 * @param cardIndices Indices into the player's hand of the cards being played
 * @param declaredCard The rank being claimed for this play
 * @param now Current timestamp in ms (injected for testability)
 */
export function applyCardPlay(
  state: GameState,
  playerIndex: number,
  cardIndices: number[],
  declaredCard: TableCard,
  now: number
): GameState {
  const player = state.players[playerIndex]

  if (!player.isAlive) {
    throw new Error('Eliminated players cannot play cards')
  }

  // Validate no duplicate indices
  const uniqueIndices = new Set(cardIndices)
  if (uniqueIndices.size !== cardIndices.length) {
    throw new Error('Duplicate card indices are not allowed')
  }

  // Validate indices are within hand bounds
  for (const idx of cardIndices) {
    if (idx >= player.hand.length) {
      throw new Error(`Card index ${idx} is out of range for hand of ${player.hand.length}`)
    }
  }

  // Remove selected cards from hand
  const playedCards = cardIndices.map(i => player.hand[i])

  // Playing this game's flagged Devil rank completely alone automatically
  // invokes its effect — there is no separate opt-in (docs/devil.card.md).
  const isDevilPlay = isDevilCardPlay(state.devilPlayerId, state.devilRank, player.id, playedCards)

  const newHand = player.hand.filter((_, i) => !cardIndices.includes(i))
  const isSafe = newHand.length === 0

  const newPile = [...state.pile, ...playedCards]

  const updatedPlayers = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, hand: newHand, isSafe, lastSeenAt: now }
      : p
  )

  const lastPlay = {
    playerId: player.id,
    playerName: player.name,
    cards: playedCards,
    claimedCount: cardIndices.length,
    claimedCard: declaredCard,
    isDevilPlay,
  }

  // The Devil Card's ability is spent for the rest of the round the moment
  // it's played, regardless of the later challenge outcome — a new one is
  // rolled on the next round reset (docs/devil.card.md).
  const devilFieldsAfterPlay = isDevilPlay
    ? { devilPlayerId: null, devilRank: null }
    : { devilPlayerId: state.devilPlayerId, devilRank: state.devilRank }

  // Only non-safe alive players can challenge — safe players sit out
  const challengerIndex = getNextAlivePlayerIndex(updatedPlayers, playerIndex, true)

  // No eligible challenger → this player is last with cards, auto-faces roulette
  if (challengerIndex === null) {
    return {
      ...state,
      status: 'roulette',
      players: updatedPlayers,
      pile: newPile,
      pileCount: newPile.length,
      challengerIndex: null,
      lastPlay,
      roulettePlayerIds: [player.id],
      roulettePhaseStartedAt: now,
      ...devilFieldsAfterPlay,
      version: state.version + 1,
      updatedAt: now,
    }
  }

  return {
    ...state,
    status: 'challenge',
    players: updatedPlayers,
    pile: newPile,
    pileCount: newPile.length,
    challengerIndex,
    lastPlay,
    ...devilFieldsAfterPlay,
    version: state.version + 1,
    updatedAt: now,
  }
}

/**
 * Resolves a single trigger pull for `playerId` against `state`: chamber
 * check, elimination, win-condition, and (when this was the last pending
 * pull) the round-reset back to `playing`. Pure — performs no I/O.
 *
 * Mirrors `applyCardPlay`'s extraction: `POST /api/game/roulette` becomes a
 * thin wrapper that resolves request-level authorization (game exists, is in
 * roulette phase, playerId is a designated shooter, player exists and is
 * alive) and then delegates the actual chamber/round logic here.
 *
 * @param state Current authoritative game state
 * @param playerId The shooter pulling the trigger this call
 * @param now Current timestamp in ms (injected for testability)
 */
export function applyRoulettePull(
  state: GameState,
  playerId: string,
  now: number
): { state: GameState; result: 'safe' | 'eliminated' } {
  const playerIndex = state.players.findIndex(p => p.id === playerId)

  // Use the player's personal chamber; fall back to fresh init if missing
  const bullets = state.settings?.bullets ?? 1
  const loserPlayer = state.players[playerIndex]
  const chamber = loserPlayer.chamber ?? initChamber(bullets)
  const chamberIndex = loserPlayer.chamberIndex ?? 0
  const eliminated = chamber[chamberIndex] === true

  const updatedPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, isAlive: !eliminated, lastSeenAt: now } : p
  )

  const alivePlayers = updatedPlayers.filter(p => p.isAlive)

  // Win condition: only one player left — ends the game immediately even if
  // other players are still pending a pull in a Devil mass penalty.
  if (alivePlayers.length <= 1) {
    const winner = alivePlayers[0] ?? null
    const finishedPlayers = updatedPlayers.map(p =>
      p.id === playerId ? { ...p, chamberIndex: (chamberIndex + 1) % 6 } : p
    )
    const updatedState: GameState = {
      ...state,
      status: 'finished',
      players: finishedPlayers,
      roulettePlayerIds: [],
      roulettePhaseStartedAt: null,
      winnerId: winner?.id ?? null,
      version: state.version + 1,
      updatedAt: now,
    }
    return { state: updatedState, result: eliminated ? 'eliminated' : 'safe' }
  }

  // If other players still owe a pull (Devil mass penalty), just record this
  // player's outcome and stay in the roulette phase — no round reset yet.
  // roulettePhaseStartedAt is deliberately left untouched: every pending
  // shooter entered the roulette phase at the same instant and shares one
  // countdown, so one shooter pulling early must not extend anyone else's
  // remaining time.
  const remainingPending = state.roulettePlayerIds.filter(id => id !== playerId)
  if (remainingPending.length > 0) {
    const nextChamberIndex = chamberIndex + 1
    const pendingBullets = state.settings?.bullets ?? 1
    const playersAfterPull = updatedPlayers.map(p => {
      if (p.id !== playerId) return p
      const nextChamber = nextChamberIndex >= 6 ? initChamber(pendingBullets) : chamber
      const nextIdx = nextChamberIndex >= 6 ? 0 : nextChamberIndex
      return { ...p, chamber: nextChamber, chamberIndex: nextIdx }
    })
    const updatedState: GameState = {
      ...state,
      players: playersAfterPull,
      roulettePlayerIds: remainingPending,
      version: state.version + 1,
      updatedAt: now,
    }
    return { state: updatedState, result: eliminated ? 'eliminated' : 'safe' }
  }

  // Round reset — reshuffle and deal new hands to all alive players
  const newDeck = shuffleDeck(createDeckForPlayerCount(alivePlayers.length))
  const { playerHands, remainingDeck } = dealCards(newDeck, alivePlayers.length)

  // The Devil Card is re-rolled every round reset, from this round's fresh
  // hands — any leftover assignment from the previous round is discarded
  // even if it was never played (docs/devil.card.md). playerHands is
  // ordered the same as alivePlayers (both walk updatedPlayers in order),
  // so handIndex maps directly onto alivePlayers.
  const finalDevilMode = state.settings?.devilMode ?? false
  const devilPick = finalDevilMode ? selectDevilCard(playerHands) : null
  const devilPlayerId = devilPick ? alivePlayers[devilPick.handIndex].id : null
  const devilRank = devilPick?.rank ?? null

  // A Devil mass penalty has no single "trigger puller" to anchor the next
  // round on — the Devil player (who never pulls) starts it instead. For a
  // normal single-loser round, the player who pulled the trigger starts the
  // next round if they survived; otherwise the next alive player after them.
  const isDevilRound = state.lastPlay?.isDevilPlay ?? false
  const nextRoundStartIndex = isDevilRound
    ? state.players.findIndex(p => p.id === state.lastPlay!.playerId)
    : eliminated
      ? getNextAlivePlayerIndex(updatedPlayers, playerIndex, false)
      : playerIndex

  // Advance loser's personal chamberIndex; re-init if all 6 used
  const nextChamberIndex = chamberIndex + 1
  const newBullets = state.settings?.bullets ?? 1

  let handIdx = 0
  const playersForNextRound = updatedPlayers.map(p => {
    if (!p.isAlive) return { ...p, isSafe: false, hand: [] as typeof p.hand }
    const hand = playerHands[handIdx++]
    if (p.id === playerId) {
      const nextChamber = nextChamberIndex >= 6 ? initChamber(newBullets) : chamber
      const nextIdx = nextChamberIndex >= 6 ? 0 : nextChamberIndex
      return { ...p, isSafe: false, hand, chamber: nextChamber, chamberIndex: nextIdx }
    }
    return { ...p, isSafe: false, hand }
  })

  const updatedState: GameState = {
    ...state,
    status: 'playing',
    players: playersForNextRound,
    deck: remainingDeck,
    tableCard: selectTableCard(),
    pile: [],
    pileCount: 0,
    currentPlayerIndex: nextRoundStartIndex ?? updatedPlayers.findIndex(p => p.isAlive),
    challengerIndex: null,
    lastPlay: null,
    roulettePlayerIds: [],
    roulettePhaseStartedAt: null,
    roundNumber: state.roundNumber + 1,
    winnerId: null,
    devilPlayerId,
    devilRank,
    version: state.version + 1,
    updatedAt: now,
  }

  return { state: updatedState, result: eliminated ? 'eliminated' : 'safe' }
}

/**
 * Returns an updated game state with every currently-pending roulette shooter
 * auto-pulled, or null if no auto-pull is needed yet.
 *
 * A Devil mass penalty has multiple pending shooters who all entered the
 * roulette phase at the same instant and share one countdown — if it expires,
 * they all auto-pull together in one call, not one-at-a-time with a fresh
 * clock each (see section 2 of docs/ui-redesign-round-table.md).
 *
 * @param state Current authoritative game state
 * @param now Current timestamp in ms (injected for testability)
 * @param countdownMs How long the roulette phase is visible before auto-pull
 */
export function autoPullIfRouletteExpired(
  state: GameState,
  now: number,
  countdownMs = ROULETTE_COUNTDOWN_MS
): GameState | null {
  if (state.status !== 'roulette' || state.roulettePlayerIds.length === 0) return null
  if (state.roulettePhaseStartedAt === null || now - state.roulettePhaseStartedAt <= countdownMs) return null

  let current: GameState = state
  for (const playerId of state.roulettePlayerIds) {
    if (current.status !== 'roulette' || !current.roulettePlayerIds.includes(playerId)) break
    current = applyRoulettePull(current, playerId, now).state
  }
  return current
}