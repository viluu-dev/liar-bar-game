'use client'

import type { ProjectedLastPlay } from '@/lib/types'

interface ClaimHistoryProps {
  history: ProjectedLastPlay[]
}

const cardLabel: Record<string, string> = {
  ACE: 'Ace',
  KING: 'King',
  QUEEN: 'Queen',
}

export default function ClaimHistory({ history }: ClaimHistoryProps) {
  if (history.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-center text-xs text-gray-600 uppercase tracking-wider">
        Claim history
      </p>
      <div className="space-y-1">
        {history.map((play, i) => {
          const isLatest = i === history.length - 1
          const card = cardLabel[play.claimedCard] ?? play.claimedCard
          const plural = play.claimedCount !== 1 ? 's' : ''
          return (
            <p
              key={i}
              className={`text-center text-xs transition-colors ${
                isLatest ? 'text-gray-300 font-medium' : 'text-gray-600'
              }`}
            >
              {play.playerName} claimed {play.claimedCount} {card}{plural}
            </p>
          )
        })}
      </div>
    </div>
  )
}
