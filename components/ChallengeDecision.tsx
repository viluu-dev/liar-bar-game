'use client'

import { useState } from 'react'
import type { ProjectedLastPlay, ProjectedPlayer } from '@/lib/types'

interface ChallengeDecisionProps {
  lastPlay: ProjectedLastPlay
  challenger: ProjectedPlayer
  isChallenger: boolean
  onChallenge?: (action: 'believe' | 'liar') => Promise<void>
}

const cardLabel: Record<string, string> = {
  ACE: 'Ace',
  KING: 'King',
  QUEEN: 'Queen',
}

export default function ChallengeDecision({
  lastPlay,
  challenger,
  isChallenger,
  onChallenge,
}: ChallengeDecisionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { playerName, claimedCount, claimedCard } = lastPlay
  const cardName = cardLabel[claimedCard] ?? claimedCard
  const plural = claimedCount !== 1 ? 's' : ''
  const claim = `${claimedCount} ${cardName}${plural}`

  const handleAction = async (action: 'believe' | 'liar') => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onChallenge?.(action)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  if (!isChallenger) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span>
            <span className="text-white font-semibold">{challenger.name}</span>{' '}
            is deciding…
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Believe or call Liar on &ldquo;{playerName} played {claim}&rdquo;
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Claim display */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-600 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Last claim</p>
        <p className="text-white font-semibold text-lg">
          {playerName} played {claim}
        </p>
        <p className="text-xs text-gray-500 mt-1">Do you believe them?</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleAction('believe')}
          disabled={isSubmitting}
          className={`
            flex-1 py-4 rounded-xl font-bold text-base min-h-[56px] transition-all duration-150
            ${isSubmitting
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-green-700 text-white active:scale-95 hover:bg-green-600 shadow-lg shadow-green-900/50'
            }
          `}
        >
          {isSubmitting ? '…' : 'Believe'}
        </button>

        <button
          onClick={() => handleAction('liar')}
          disabled={isSubmitting}
          className={`
            flex-1 py-4 rounded-xl font-bold text-base min-h-[56px] transition-all duration-150
            ${isSubmitting
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-red-700 text-white active:scale-95 hover:bg-red-600 shadow-lg shadow-red-900/50'
            }
          `}
        >
          {isSubmitting ? '…' : 'Liar!'}
        </button>
      </div>
    </div>
  )
}
