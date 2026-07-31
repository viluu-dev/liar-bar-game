'use client'

import { TableCard as TableCardType } from '@/lib/types'

interface PlayedPileProps {
  pileCount: number
  tableCard: TableCardType | null
  roundNumber: number
}

const cardSymbols = {
  ACE: '♠A',
  KING: '♠K',
  QUEEN: '♠Q',
} as const

const cardColors = {
  ACE: 'text-red-500',
  KING: 'text-yellow-400',
  QUEEN: 'text-purple-400',
} as const

export default function PlayedPile({ pileCount, tableCard, roundNumber }: PlayedPileProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Round {roundNumber}</div>

      <div className="flex items-center gap-3">
        {/* Round's target rank — a compact face-up chip, kept separate from the discard stack */}
        {tableCard && (
          <div className="w-9 h-12 rounded-md bg-gray-800 border border-gray-600 flex items-center justify-center shrink-0">
            <span className={`text-sm font-bold ${cardColors[tableCard]}`}>{cardSymbols[tableCard]}</span>
          </div>
        )}

        {/* Accumulating discard pile — layered, slightly-rotated card backs */}
        <div className="relative w-9 h-12 shrink-0">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute inset-0 rounded-md bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600"
              style={{ transform: `rotate(${(i - 1) * 6}deg)`, zIndex: i }}
            />
          ))}
          <div className="absolute -bottom-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-yellow-500 text-black text-[10px] font-bold flex items-center justify-center z-10">
            {pileCount}
          </div>
        </div>
      </div>
    </div>
  )
}
