'use client'

import { useState, useEffect } from 'react'
import { Card, GameStatus, ProjectedLastPlay, TableCard } from '@/lib/types'

interface CardHandProps {
  cards: Card[]
  isMyTurn: boolean // true for a normal turn OR for the challenger during 'challenge'
  gameStatus: GameStatus
  myDevilRank: TableCard | null
  onPlay?: (selectedIndices: number[]) => Promise<void>
  lastPlay?: ProjectedLastPlay | null // claim being judged, only meaningful when gameStatus === 'challenge'
  onLiar?: () => Promise<void> // wired to POST /api/game/challenge {action:'liar'}
}

const cardSymbols = {
  ACE: '♠A',
  KING: '♠K',
  QUEEN: '♠Q',
  JOKER: '🃏',
} as const

const cardColors = {
  ACE: 'text-red-500',
  KING: 'text-yellow-400',
  QUEEN: 'text-purple-400',
  JOKER: 'text-green-400',
} as const

const cardLabel: Record<string, string> = {
  ACE: 'Ace',
  KING: 'King',
  QUEEN: 'Queen',
}

export default function CardHand({ cards, isMyTurn, gameStatus, myDevilRank, onPlay, lastPlay, onLiar }: CardHandProps) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isMyTurn) {
      setSelectedIndices([])
      setIsSubmitting(false)
      setError(null)
    }
  }, [isMyTurn])

  const isChallengePhase = gameStatus === 'challenge'
  const canInteract = isMyTurn && (gameStatus === 'playing' || isChallengePhase) && !isSubmitting
  const canLiar = isMyTurn && isChallengePhase && !isSubmitting

  const handleCardTap = (index: number) => {
    if (!canInteract) return
    setSelectedIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index)
      if (prev.length >= 3) return prev
      return [...prev, index]
    })
  }

  const handlePlay = async () => {
    if (selectedIndices.length < 1 || !canInteract) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onPlay?.(selectedIndices)
      // Success: turn advances via polling → isMyTurn → false → useEffect resets
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  const handleLiar = async () => {
    if (!canLiar) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onLiar?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  // Playing this card completely alone automatically invokes its Devil
  // effect — there's no separate opt-in, so this is purely informational.
  const willInvokeDevil =
    myDevilRank !== null && selectedIndices.length === 1 && cards[selectedIndices[0]] === myDevilRank

  const claim = lastPlay ? `${lastPlay.claimedCount} ${cardLabel[lastPlay.claimedCard] ?? lastPlay.claimedCard}${lastPlay.claimedCount !== 1 ? 's' : ''}` : null

  return (
    <div className="text-center">
      {isChallengePhase && lastPlay && (
        <div className="mb-3 bg-gray-800 rounded-xl p-3 border border-gray-600">
          <p className="text-white text-sm">
            <span className="font-semibold">{lastPlay.playerName}</span> played {claim}
          </p>
          {isMyTurn && <p className="text-xs text-gray-500 mt-1">Do you believe them?</p>}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="py-6">
          <div className="text-gray-400">No cards in hand</div>
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-gray-400">
            {isMyTurn ? 'Your Hand' : 'Hand'} ({cards.length} cards)
            {isMyTurn && gameStatus === 'playing' && (
              <span className="text-yellow-400 ml-2">• Your Turn</span>
            )}
          </div>

          <div className="flex justify-center space-x-2 overflow-x-auto pb-2 px-2">
            {cards.map((card, index) => (
              <CardComponent
                key={index}
                card={card}
                canInteract={canInteract}
                isSelected={selectedIndices.includes(index)}
                isDevilRank={myDevilRank !== null && card === myDevilRank}
                onTap={() => handleCardTap(index)}
              />
            ))}
          </div>

          {canInteract && (
            <div className="mt-3 text-xs text-gray-400 min-h-[1rem]">
              {selectedIndices.length === 0
                ? 'Tap to select 1–3 cards to play'
                : `${selectedIndices.length} card${selectedIndices.length !== 1 ? 's' : ''} selected`}
            </div>
          )}

          {canInteract && willInvokeDevil && (
            <div className="mt-2 text-xs text-red-400">
              😈 Playing this card alone invokes the Devil effect
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-center text-sm text-red-400">{error}</p>
      )}

      {isMyTurn && (gameStatus === 'playing' || isChallengePhase) && (
        <div className="mt-4 flex items-center justify-center gap-3">
          {isChallengePhase && (
            <button
              onClick={handleLiar}
              disabled={!canLiar}
              className={`
                min-w-[100px] min-h-[44px] px-6 py-3 rounded-lg font-bold text-sm transition-all duration-150
                ${canLiar
                  ? 'bg-red-700 text-white active:scale-95 hover:bg-red-600 shadow-lg shadow-red-900/50'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Liar!
            </button>
          )}

          <button
            onClick={handlePlay}
            disabled={!(canInteract && selectedIndices.length >= 1)}
            className={`
              min-w-[120px] min-h-[44px] px-8 py-3 rounded-lg font-semibold text-sm transition-all duration-200
              flex items-center justify-center gap-2
              ${canInteract && selectedIndices.length >= 1
                ? 'bg-yellow-500 text-black active:scale-95 hover:bg-yellow-400 shadow-lg shadow-yellow-500/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {isSubmitting && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {isSubmitting
              ? 'Playing…'
              : selectedIndices.length > 0
                ? `Play (${selectedIndices.length})`
                : 'Play'}
          </button>
        </div>
      )}
    </div>
  )
}

interface CardComponentProps {
  card: Card
  canInteract: boolean
  isSelected: boolean
  isDevilRank: boolean
  onTap: () => void
}

function CardComponent({ card, canInteract, isSelected, isDevilRank, onTap }: CardComponentProps) {
  return (
    <div
      onClick={onTap}
      className={`
        relative w-16 h-24 rounded-lg flex flex-col items-center justify-center shrink-0
        transition-all duration-200 select-none
        ${isSelected
          ? 'bg-gray-700 border-2 border-yellow-400 -translate-y-4 shadow-lg shadow-yellow-400/40'
          : canInteract
            ? 'bg-gray-800 border-2 border-gray-600 hover:border-gray-400 cursor-pointer active:scale-95'
            : 'bg-gray-800 border-2 border-gray-700'
        }
      `}
    >
      <div className={`text-2xl font-bold ${cardColors[card]}`}>
        {cardSymbols[card]}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {card}
      </div>
      {isSelected && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs text-black font-bold leading-none">
          ✓
        </div>
      )}
      {isDevilRank && (
        <div className="absolute -top-2 -left-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-xs leading-none">
          😈
        </div>
      )}
    </div>
  )
}
