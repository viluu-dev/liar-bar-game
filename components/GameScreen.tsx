'use client'

import { useState, useEffect, useRef } from 'react'
import { ProjectedGameState, ProjectedLastPlay } from '@/lib/types'
import TableCard from './TableCard'
import RoundTable from './RoundTable'
import CardHand from './CardHand'
import GameStatus from './GameStatus'
import ChallengeReveal from './ChallengeReveal'
import GameOverScreen from './GameOverScreen'
import ClaimHistory from './ClaimHistory'

interface GameScreenProps {
  gameState: ProjectedGameState
  playerId: string
  joinCode: string
}

export default function GameScreen({ gameState, playerId, joinCode }: GameScreenProps) {
  if (gameState.status === 'finished') {
    return (
      <GameOverScreen
        winnerId={gameState.winnerId}
        players={gameState.players}
        playerId={playerId}
        joinCode={joinCode}
        rematchPlayerIds={gameState.rematchPlayerIds}
        isHost={gameState.players.find(p => p.id === playerId)?.isHost ?? false}
      />
    )
  }

  const [playError, setPlayError] = useState<string | null>(null)
  const [claimHistory, setClaimHistory] = useState<ProjectedLastPlay[]>([])
  const lastPlayKeyRef = useRef<string | null>(null)
  const prevRoundRef = useRef<number>(gameState.roundNumber)

  useEffect(() => {
    // Clear history when a new round starts
    if (gameState.roundNumber !== prevRoundRef.current) {
      setClaimHistory([])
      lastPlayKeyRef.current = null
      prevRoundRef.current = gameState.roundNumber
    }

    // Capture new claim when status enters challenge (a play just occurred)
    if (gameState.status === 'challenge' && gameState.lastPlay) {
      const key = `${gameState.roundNumber}-${gameState.lastPlay.playerId}-${gameState.lastPlay.claimedCount}-${gameState.lastPlay.claimedCard}`
      if (key !== lastPlayKeyRef.current) {
        lastPlayKeyRef.current = key
        setClaimHistory(prev => [...prev, gameState.lastPlay!].slice(-5))
      }
    }
  }, [gameState.status, gameState.lastPlay, gameState.roundNumber])

  const handleRoulette = async () => {
    let res: Response
    try {
      res = await fetch('/api/game/roulette', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, joinCode }),
      })
    } catch {
      throw new Error('Network error — try again')
    }
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Failed to process roulette')
    }
  }

  const handleLiar = async () => {
    let res: Response
    try {
      res = await fetch('/api/game/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, joinCode, action: 'liar' }),
      })
    } catch {
      throw new Error('Network error — try again')
    }
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Failed to process challenge')
    }
  }

  const handlePlay = async (selectedIndices: number[]) => {
    if (!gameState.tableCard) return
    setPlayError(null)

    let res: Response
    try {
      res = await fetch('/api/game/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          joinCode,
          cardIndices: selectedIndices,
          declaredCard: gameState.tableCard,
        }),
      })
    } catch {
      const msg = 'Network error — try again'
      setPlayError(msg)
      throw new Error(msg)
    }

    if (!res.ok) {
      const data = await res.json()
      const msg = data.error ?? 'Failed to play cards'
      setPlayError(msg)
      throw new Error(msg)
    }
  }

  const myIndex = gameState.players.findIndex(p => p.id === playerId)
  const activePlayerId =
    gameState.status === 'playing'
      ? gameState.players[gameState.currentPlayerIndex]?.id ?? null
      : gameState.status === 'challenge'
        ? gameState.players[gameState.challengerIndex ?? -1]?.id ?? null
        : null

  const isMyTurn =
    gameState.status === 'playing'
      ? gameState.players[gameState.currentPlayerIndex]?.id === playerId
      : gameState.players[gameState.challengerIndex ?? -1]?.id === playerId

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col">
      <div className="shrink-0 p-4 border-b border-gray-700">
        <GameStatus gameState={gameState} playerId={playerId} />
      </div>

      <div className="flex-1 flex flex-col p-4 space-y-6">
        <div className="shrink-0">
          <TableCard card={gameState.tableCard} />
        </div>

        {claimHistory.length > 0 && (
          <div className="shrink-0">
            <ClaimHistory history={claimHistory} />
          </div>
        )}

        <div className="flex-1 min-h-0 flex items-center justify-center">
          <RoundTable
            players={gameState.players}
            myIndex={myIndex}
            myPlayerId={playerId}
            activePlayerId={activePlayerId}
            roulettePlayerIds={gameState.roulettePlayerIds}
            roulettePhaseStartedAt={gameState.roulettePhaseStartedAt}
            pileCount={gameState.pileCount}
            tableCard={gameState.tableCard}
            roundNumber={gameState.roundNumber}
          />
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-gray-700">
        {gameState.status === 'roulette' &&
        gameState.lastPlay?.cards &&
        gameState.roulettePlayerIds.length > 0 &&
        gameState.tableCard ? (
          <ChallengeReveal
            lastPlay={gameState.lastPlay as typeof gameState.lastPlay & { cards: NonNullable<typeof gameState.lastPlay.cards>; isDevilPlay: boolean }}
            tableCard={gameState.tableCard}
            pendingShooters={gameState.players.filter(p => gameState.roulettePlayerIds.includes(p.id))}
            players={gameState.players}
            playerId={playerId}
            roulettePhaseStartedAt={gameState.status === 'roulette' ? gameState.roulettePhaseStartedAt : null}
            onRoulette={handleRoulette}
          />
        ) : (
          <>
            {playError && (
              <div className="mb-2 text-center text-sm text-red-400">{playError}</div>
            )}
            <CardHand
              cards={gameState.myHand}
              isMyTurn={isMyTurn}
              gameStatus={gameState.status}
              myDevilRank={gameState.myDevilRank}
              lastPlay={gameState.status === 'challenge' ? gameState.lastPlay : null}
              onPlay={handlePlay}
              onLiar={handleLiar}
            />
          </>
        )}
      </div>
    </div>
  )
}
