'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProjectedPlayer } from '@/lib/types'

interface GameOverScreenProps {
  winnerId: string | null
  players: ProjectedPlayer[]
  playerId: string
  joinCode: string
  rematchPlayerIds?: string[]
  isHost?: boolean
}

export default function GameOverScreen({ winnerId, players, playerId, joinCode, rematchPlayerIds, isHost }: GameOverScreenProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const winner = players.find(p => p.id === winnerId)
  const isWinner = winnerId === playerId
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.id === winnerId) return -1
    if (b.id === winnerId) return 1
    return 0
  })

  const rematchCount = rematchPlayerIds?.length ?? 0
  const totalCount = players.length
  const hasAlreadyRequested = rematchPlayerIds?.includes(playerId) ?? false
  const anyoneClicked = rematchCount > 0

  const handleRematch = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/game/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, joinCode }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to start rematch')
      }
      // Success: polling will detect status change → redirect to lobby automatically
    } catch {
      setError('Network error — try again')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHome = () => {
    localStorage.removeItem('liars-bar-player-id')
    router.push('/')
  }

  // Host: simple "Play Again" — no wait, creates lobby immediately
  // Non-host: show count only after someone has clicked
  const rematchButtonLabel = isHost
    ? 'Play Again'
    : hasAlreadyRequested
      ? `Waiting… (${rematchCount}/${totalCount})`
      : anyoneClicked
        ? `Play Again (${rematchCount}/${totalCount})`
        : 'Play Again'

  const isRematchDisabled = isLoading || (!isHost && hasAlreadyRequested)

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Winner announcement */}
        <div className="text-center space-y-3">
          <div className="text-6xl mb-4">{isWinner ? '🏆' : '💀'}</div>
          {winner ? (
            <>
              <h1 className="text-3xl font-bold">
                {isWinner ? 'You won!' : `${winner.name} wins!`}
              </h1>
              <p className="text-gray-400">
                {isWinner
                  ? 'You outlasted everyone. Last one standing!'
                  : `${winner.name} was the last survivor.`}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold">Game Over</h1>
              <p className="text-gray-400">No survivors.</p>
            </>
          )}
        </div>

        {/* Player results */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Final standings
          </h2>
          {sortedPlayers.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                player.id === winnerId
                  ? 'bg-yellow-900/40 border border-yellow-600'
                  : 'bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {player.id === winnerId ? '🏆' : '💀'}
                </span>
                <span className={`font-medium ${player.id === playerId ? 'text-blue-300' : 'text-white'}`}>
                  {player.name}
                  {player.id === playerId && (
                    <span className="text-gray-500 text-xs ml-1">(you)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rematchPlayerIds?.includes(player.id) && (
                  <span className="text-xs text-green-400">Ready</span>
                )}
                <span className={`text-sm ${player.id === winnerId ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                  {player.id === winnerId ? 'Winner' : 'Eliminated'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleRematch}
            disabled={isRematchDisabled}
            className={`w-full py-4 min-h-[44px] rounded-xl font-bold text-base transition-all duration-150 ${
              isRematchDisabled
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 shadow-lg shadow-yellow-500/30'
            }`}
          >
            {isLoading ? 'Sending…' : rematchButtonLabel}
          </button>
          <button
            onClick={handleHome}
            className="w-full py-3 min-h-[44px] rounded-xl font-medium text-sm text-gray-400 hover:text-gray-200 active:scale-95 transition-all duration-150"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  )
}
