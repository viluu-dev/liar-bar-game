'use client'

import { TableCard as TableCardType } from '@/lib/types'

interface TableCardProps {
  card: TableCardType | null
  pileCount: number
  roundNumber: number
}

const cardSymbols = {
  ACE: '♠A',
  KING: '♠K', 
  QUEEN: '♠Q'
} as const

const cardColors = {
  ACE: 'text-red-500',
  KING: 'text-yellow-400',
  QUEEN: 'text-purple-400'
} as const

export default function TableCard({ card, pileCount, roundNumber }: TableCardProps) {
  if (!card) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400">Waiting for game to start...</div>
      </div>
    )
  }

  return (
    <div className="text-center">
      {/* Round Information */}
      <div className="mb-2 text-sm text-gray-400">
        Round {roundNumber} • {pileCount} cards in pile
      </div>
      
      {/* Table Card Display */}
      <div className="bg-gray-800 rounded-xl p-6 mx-auto max-w-xs border-2 border-gray-600">
        <div className="text-sm text-gray-400 mb-2">Table Card</div>
        <div className={`text-6xl font-bold ${cardColors[card]} mb-2`}>
          {cardSymbols[card]}
        </div>
        <div className="text-sm text-gray-300">
          All plays must be declared as <span className="font-semibold">{card}s</span>
        </div>
      </div>
    </div>
  )
}