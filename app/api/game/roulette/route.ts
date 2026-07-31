import { NextRequest, NextResponse } from 'next/server'
import { RouletteRequestSchema } from '@/lib/schemas'
import { getGameState, setGameState, withGameLock } from '@/lib/redis'
import { createDeckForPlayerCount, shuffleDeck, dealCards, selectTableCard, initChamber, getNextAlivePlayerIndex } from '@/lib/game-logic'
import type { RouletteResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = RouletteRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId is required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode } = parseResult.data

    const result = await withGameLock(joinCode, async () => {
      const gameState = await getGameState(joinCode)

      if (!gameState) {
        throw new Error('No active game session found')
      }

      if (gameState.status !== 'roulette') {
        throw new Error('Game is not in roulette phase')
      }

      if (!gameState.roulettePlayerIds.includes(playerId)) {
        throw new Error('Only a designated shooter can pull the trigger')
      }

      const playerIndex = gameState.players.findIndex(p => p.id === playerId)
      if (playerIndex === -1) {
        throw new Error('Player not found in current game session')
      }

      if (!gameState.players[playerIndex].isAlive) {
        throw new Error('Player is already eliminated')
      }

      // Use the player's personal chamber; fall back to fresh init if missing
      const bullets = gameState.settings?.bullets ?? 1
      const loserPlayer = gameState.players[playerIndex]
      const chamber = loserPlayer.chamber ?? initChamber(bullets)
      const chamberIndex = loserPlayer.chamberIndex ?? 0
      const eliminated = chamber[chamberIndex] === true

      const updatedPlayers = gameState.players.map((p, i) =>
        i === playerIndex ? { ...p, isAlive: !eliminated, lastSeenAt: Date.now() } : p
      )

      const alivePlayers = updatedPlayers.filter(p => p.isAlive)

      // Win condition: only one player left — ends the game immediately even if
      // other players are still pending a pull in a Devil mass penalty.
      if (alivePlayers.length <= 1) {
        const winner = alivePlayers[0] ?? null
        const finishedPlayers = updatedPlayers.map(p =>
          p.id === playerId ? { ...p, chamberIndex: (chamberIndex + 1) % 6 } : p
        )
        const updatedState = {
          ...gameState,
          status: 'finished' as const,
          players: finishedPlayers,
          roulettePlayerIds: [],
          winnerId: winner?.id ?? null,
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }
        await setGameState(updatedState)
        return { version: updatedState.version, result: eliminated ? 'eliminated' : 'safe' } as const
      }

      // If other players still owe a pull (Devil mass penalty), just record this
      // player's outcome and stay in the roulette phase — no round reset yet.
      const remainingPending = gameState.roulettePlayerIds.filter(id => id !== playerId)
      if (remainingPending.length > 0) {
        const nextChamberIndex = chamberIndex + 1
        const pendingBullets = gameState.settings?.bullets ?? 1
        const playersAfterPull = updatedPlayers.map(p => {
          if (p.id !== playerId) return p
          const nextChamber = nextChamberIndex >= 6 ? initChamber(pendingBullets) : chamber
          const nextIdx = nextChamberIndex >= 6 ? 0 : nextChamberIndex
          return { ...p, chamber: nextChamber, chamberIndex: nextIdx }
        })
        const updatedState = {
          ...gameState,
          players: playersAfterPull as typeof gameState.players,
          roulettePlayerIds: remainingPending,
          version: gameState.version + 1,
          updatedAt: Date.now(),
        }
        await setGameState(updatedState)
        return { version: updatedState.version, result: eliminated ? 'eliminated' : 'safe' } as const
      }

      // Round reset — reshuffle and deal new hands to all alive players
      const devilMode = gameState.settings?.devilMode ?? false
      const newDeck = shuffleDeck(createDeckForPlayerCount(alivePlayers.length, devilMode))
      const { playerHands, remainingDeck } = dealCards(newDeck, alivePlayers.length)

      // A Devil mass penalty has no single "trigger puller" to anchor the next
      // round on — the Devil player (who never pulls) starts it instead. For a
      // normal single-loser round, the player who pulled the trigger starts the
      // next round if they survived; otherwise the next alive player after them.
      const isDevilRound =
        gameState.lastPlay?.cards.length === 1 && gameState.lastPlay.cards[0] === 'DEVIL'
      const nextRoundStartIndex = isDevilRound
        ? gameState.players.findIndex(p => p.id === gameState.lastPlay!.playerId)
        : eliminated
          ? getNextAlivePlayerIndex(updatedPlayers, playerIndex, false)
          : playerIndex

      // Advance loser's personal chamberIndex; re-init if all 6 used
      const nextChamberIndex = chamberIndex + 1
      const newBullets = gameState.settings?.bullets ?? 1

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

      const updatedState = {
        ...gameState,
        status: 'playing' as const,
        players: playersForNextRound as typeof gameState.players,
        deck: remainingDeck,
        tableCard: selectTableCard(),
        pile: [],
        pileCount: 0,
        currentPlayerIndex: nextRoundStartIndex ?? updatedPlayers.findIndex(p => p.isAlive),
        challengerIndex: null,
        lastPlay: null,
        roulettePlayerIds: [],
        roundNumber: gameState.roundNumber + 1,
        winnerId: null,
        version: gameState.version + 1,
        updatedAt: Date.now(),
      }

      await setGameState(updatedState)
      return { version: updatedState.version, result: eliminated ? 'eliminated' : 'safe' } as const
    })

    const response: RouletteResponse = {
      success: true,
      gameVersion: result.version,
      result: result.result,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Roulette error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to process roulette'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
