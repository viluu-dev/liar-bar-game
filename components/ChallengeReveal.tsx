'use client'

import { useState } from 'react'
import type { Card, ProjectedLastPlay, ProjectedPlayer, TableCard } from '@/lib/types'
import ChamberDots from './ChamberDots'

interface ChallengeRevealProps {
  lastPlay: ProjectedLastPlay & { cards: Card[] }
  tableCard: TableCard
  loser: ProjectedPlayer
  players: ProjectedPlayer[]
  playerId: string
  onRoulette?: () => Promise<void>
}

const cardSymbols: Record<Card, string> = {
  ACE: '♠A',
  KING: '♠K',
  QUEEN: '♠Q',
  JOKER: '🃏',
}

const cardColors: Record<Card, string> = {
  ACE: 'text-red-400',
  KING: 'text-yellow-400',
  QUEEN: 'text-purple-400',
  JOKER: 'text-green-400',
}

function isValidCard(card: Card, tableCard: TableCard): boolean {
  return card === tableCard || card === 'JOKER'
}

export default function ChallengeReveal({
  lastPlay,
  tableCard,
  loser,
  players,
  playerId,
  onRoulette,
}: ChallengeRevealProps) {
  const chamberIndex = loser.chamberIndex
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { playerName, claimedCount, claimedCard, cards } = lastPlay
  const allValid = cards.every(c => isValidCard(c, tableCard))
  const isLoser = loser.id === playerId
  const cardLabel = (c: number) => (c === 1 ? 'card' : 'cards')

  const handleRoulette = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onRoulette?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Claim being judged */}
      <div className="text-center text-sm text-gray-400">
        <span className="text-white font-semibold">{playerName}</span> claimed{' '}
        {claimedCount} {cardLabel(claimedCount)} were {claimedCard}s
      </div>

      {/* Revealed cards */}
      <div>
        <p className="text-center text-xs text-gray-500 uppercase tracking-wider mb-3">
          Cards revealed
        </p>
        <div className="flex justify-center gap-2">
          {cards.map((card, i) => {
            const valid = isValidCard(card, tableCard)
            return (
              <div
                key={i}
                className={`
                  relative w-16 h-24 rounded-lg border-2 flex flex-col items-center justify-center
                  ${valid
                    ? 'bg-gray-800 border-green-500 shadow-lg shadow-green-500/20'
                    : 'bg-gray-800 border-red-500 shadow-lg shadow-red-500/20'
                  }
                `}
              >
                <div className={`text-2xl font-bold ${cardColors[card]}`}>
                  {cardSymbols[card]}
                </div>
                <div className="text-xs text-gray-400 mt-1">{card}</div>
                {card === 'JOKER' && (
                  <div className="absolute -top-2 -right-2 bg-green-500 text-black text-xs font-bold px-1 rounded">
                    wild
                  </div>
                )}
                {!valid && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-1 rounded">
                    ✗
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Verdict */}
      <div
        className={`rounded-xl p-4 text-center border ${
          allValid
            ? 'bg-green-900/30 border-green-700'
            : 'bg-red-900/30 border-red-700'
        }`}
      >
        <p className="font-bold text-lg mb-1">
          {allValid ? '✓ Honest play!' : '✗ Caught lying!'}
        </p>
        <p className="text-sm text-gray-300">
          {allValid
            ? 'The cards were legitimate — the caller was wrong.'
            : 'The cards did not match — the lie was exposed.'}
        </p>
      </div>

      {/* Roulette trigger */}
      {chamberIndex !== undefined && (
        <div className="flex flex-col items-center gap-1">
          <ChamberDots chamberIndex={chamberIndex} size="md" />
          <p className="text-xs text-gray-500">
            {6 - chamberIndex} position{6 - chamberIndex !== 1 ? 's' : ''} remaining
          </p>
        </div>
      )}

      {isLoser ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-red-400 font-semibold animate-pulse">
            Your fate awaits…
          </p>
          {error && (
            <p className="text-center text-xs text-red-400">{error}</p>
          )}
          <button
            onClick={handleRoulette}
            disabled={isSubmitting}
            className={`
              w-full py-5 rounded-xl font-bold text-xl min-h-[64px] tracking-wide
              transition-all duration-150 border-2
              ${isSubmitting
                ? 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'
                : 'bg-red-900 border-red-600 text-white active:scale-95 hover:bg-red-800 shadow-xl shadow-red-900/60'
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Pulling…
              </span>
            ) : (
              '🔫 Pull the Trigger'
            )}
          </button>
        </div>
      ) : (
        <div className="text-center py-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block mr-2" />
          <span className="text-gray-400 text-sm">
            Waiting for{' '}
            <span className="text-white font-semibold">{loser.name}</span>{' '}
            to pull the trigger…
          </span>
        </div>
      )}
    </div>
  )
}
