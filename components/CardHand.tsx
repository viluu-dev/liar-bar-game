'use client'

import { Card, GameStatus } from '@/lib/types'

interface CardHandProps {
  cards: Card[]
  isMyTurn: boolean
  gameStatus: GameStatus
}

const cardSymbols = {
  ACE: '♠A',
  KING: '♠K',
  QUEEN: '♠Q',
  JOKER: '🃏'
} as const

const cardColors = {
  ACE: 'text-red-500',
  KING: 'text-yellow-400', 
  QUEEN: 'text-purple-400',
  JOKER: 'text-green-400'
} as const

export default function CardHand({ cards, isMyTurn, gameStatus }: CardHandProps) {
  if (cards.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="text-gray-400">No cards in hand</div>
      </div>
    )
  }

  const canInteract = isMyTurn && gameStatus === 'playing'

  return (
    <div className="text-center">
      {/* Hand Label */}
      <div className="mb-3 text-sm text-gray-400">
        Your Hand ({cards.length} cards)
        {isMyTurn && gameStatus === 'playing' && (
          <span className="text-yellow-400 ml-2">• Your Turn</span>
        )}
      </div>
      
      {/* Cards Display */}
      <div className="flex justify-center space-x-2 overflow-x-auto pb-2">
        {cards.map((card, index) => (
          <CardComponent 
            key={index}
            card={card}
            index={index}
            canInteract={canInteract}
          />
        ))}
      </div>
      
      {/* Action Hint */}
      {canInteract && (
        <div className="mt-3 text-xs text-gray-400">
          Tap to select 1-3 cards to play
        </div>
      )}
    </div>
  )
}

interface CardComponentProps {
  card: Card
  index: number
  canInteract: boolean
}

function CardComponent({ card, index, canInteract }: CardComponentProps) {
  return (
    <div 
      className={`
        relative w-16 h-24 bg-gray-800 border-2 rounded-lg flex flex-col items-center justify-center
        transition-all duration-200 shrink-0
        ${canInteract 
          ? 'border-gray-600 hover:border-gray-400 cursor-pointer active:scale-95' 
          : 'border-gray-700'
        }
      `}
    >
      {/* Card Content */}
      <div className={`text-2xl font-bold ${cardColors[card]}`}>
        {cardSymbols[card]}
      </div>
      
      {/* Card Name */}
      <div className="text-xs text-gray-400 mt-1">
        {card}
      </div>
      
      {/* Interactive Overlay for Future Selection */}
      {canInteract && (
        <div className="absolute inset-0 rounded-lg bg-transparent hover:bg-white/5 transition-colors duration-200" />
      )}
    </div>
  )
}