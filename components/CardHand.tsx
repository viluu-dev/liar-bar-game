'use client'

import { useState, useEffect } from 'react'
import { Card, GameStatus } from '@/lib/types'

interface CardHandProps {
  cards: Card[]
  isMyTurn: boolean
  gameStatus: GameStatus
  onPlay?: (selectedIndices: number[]) => Promise<void>
}

const cardSymbols = {
  ACE: '♠A',
  KING: '♠K',
  QUEEN: '♠Q',
  JOKER: '🃏',
  DEVIL: '😈'
} as const

const cardColors = {
  ACE: 'text-red-500',
  KING: 'text-yellow-400',
  QUEEN: 'text-purple-400',
  JOKER: 'text-green-400',
  DEVIL: 'text-red-600'
} as const

export default function CardHand({ cards, isMyTurn, gameStatus, onPlay }: CardHandProps) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isMyTurn) {
      setSelectedIndices([])
      setIsSubmitting(false)
    }
  }, [isMyTurn])

  const canInteract = isMyTurn && gameStatus === 'playing' && !isSubmitting

  const handleCardTap = (index: number) => {
    if (!canInteract) return
    setSelectedIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index)
      // The Devil Card must be played strictly alone
      if (cards[index] === 'DEVIL') return [index]
      if (prev.some(i => cards[i] === 'DEVIL')) return prev
      if (prev.length >= 3) return prev
      return [...prev, index]
    })
  }

  const handlePlay = async () => {
    if (selectedIndices.length < 1 || !canInteract) return
    setIsSubmitting(true)
    try {
      await onPlay?.(selectedIndices)
      // Success: turn advances via polling → isMyTurn → false → useEffect resets
    } catch {
      // Failure: re-enable button so user can retry
      setIsSubmitting(false)
    }
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="text-gray-400">No cards in hand</div>
      </div>
    )
  }

  const canPlay = canInteract && selectedIndices.length >= 1

  return (
    <div className="text-center">
      <div className="mb-3 text-sm text-gray-400">
        Your Hand ({cards.length} cards)
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
            onTap={() => handleCardTap(index)}
          />
        ))}
      </div>

      {canInteract && (
        <div className="mt-3 text-xs text-gray-400 min-h-[1rem]">
          {selectedIndices.length === 1 && cards[selectedIndices[0]] === 'DEVIL'
            ? '😈 Devil Card selected — must be played alone'
            : selectedIndices.length === 0
              ? 'Tap to select 1–3 cards to play'
              : `${selectedIndices.length} card${selectedIndices.length !== 1 ? 's' : ''} selected`}
        </div>
      )}

      {isMyTurn && gameStatus === 'playing' && (
        <button
          onClick={handlePlay}
          disabled={!canPlay}
          className={`
            mt-4 min-w-[120px] min-h-[44px] px-8 py-3 rounded-lg font-semibold text-sm transition-all duration-200
            flex items-center justify-center gap-2 mx-auto
            ${canPlay
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
      )}
    </div>
  )
}

interface CardComponentProps {
  card: Card
  canInteract: boolean
  isSelected: boolean
  onTap: () => void
}

function CardComponent({ card, canInteract, isSelected, onTap }: CardComponentProps) {
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
    </div>
  )
}
