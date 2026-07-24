'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import GameScreen from '@/components/GameScreen'
import RouletteResultOverlay from '@/components/RouletteResultOverlay'
import { useGameChannel } from '@/lib/useGameChannel'
import type { GameStateResponse } from '@/lib/types'

class NotInGameError extends Error {
  constructor() { super('Player not in game'); this.name = 'NotInGameError' }
}

async function fetchGameState(playerId: string, joinCode: string): Promise<GameStateResponse> {
  const res = await fetch(`/api/game/state?playerId=${encodeURIComponent(playerId)}&code=${encodeURIComponent(joinCode)}`)
  if (res.status === 404) throw new NotInGameError()
  if (!res.ok) throw new Error('Failed to fetch game state')
  return res.json()
}

export default function GamePage() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const router = useRouter()
  const errorCountRef = useRef(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const prevDataRef = useRef<GameStateResponse | null>(null)
  const [rouletteFlash, setRouletteFlash] = useState<{
    playerName: string
    survived: boolean
    isMe: boolean
  } | null>(null)
  const clearFlash = useCallback(() => setRouletteFlash(null), [])

  useEffect(() => {
    const id = localStorage.getItem('liars-bar-player-id')
    const code = localStorage.getItem('liars-bar-join-code')
    if (!id || !code) {
      router.replace('/')
      return
    }
    setPlayerId(id)
    setJoinCode(code)
  }, [router])

  useGameChannel(joinCode, playerId)

  const { data, error, isLoading } = useSWR(
    playerId && joinCode ? ['gameState', playerId, joinCode] : null,
    () => fetchGameState(playerId!, joinCode!),
    {
      refreshInterval: 12000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onSuccess: () => {
        errorCountRef.current = 0
        setIsReconnecting(false)
      },
      onError: (err) => {
        if (err instanceof NotInGameError) {
          const code = localStorage.getItem('liars-bar-join-code') ?? ''
          localStorage.removeItem('liars-bar-player-id')
          router.replace(code ? `/?code=${code}` : '/')
          return
        }
        errorCountRef.current += 1
        if (errorCountRef.current >= 3) setIsReconnecting(true)
      },
    }
  )

  // Detect roulette resolution → show full-screen result for 2s
  useEffect(() => {
    const prev = prevDataRef.current
    if (
      prev?.gameState?.status === 'roulette' &&
      data?.gameState &&
      data.gameState.status !== 'roulette' &&
      !rouletteFlash
    ) {
      const roulettePlayerId = prev.gameState.roulettePlayerId
      const player = prev.gameState.players.find(p => p.id === roulettePlayerId)
      const currPlayer = data.gameState.players.find(p => p.id === roulettePlayerId)
      if (player) {
        setRouletteFlash({
          playerName: player.name,
          survived: currPlayer?.isAlive ?? false,
          isMe: roulettePlayerId === playerId,
        })
      }
    }
    prevDataRef.current = data ?? null
  }, [data, playerId, rouletteFlash])

  // Redirect to lobby if game hasn't started
  useEffect(() => {
    if (data?.gameState?.status === 'lobby') router.replace('/lobby')
  }, [data, router])

  // Redirect home if no game or player not in game
  useEffect(() => {
    if (data?.phase === 'none') {
      localStorage.removeItem('liars-bar-player-id')
      localStorage.removeItem('liars-bar-join-code')
      router.replace('/')
    }
  }, [data, router])

  if (!playerId || !joinCode || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-400 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading game…</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="text-center space-y-4">
          <p className="text-red-400 font-semibold">Connection failed</p>
          <button
            onClick={() => router.replace('/')}
            className="text-sm text-gray-400 underline hover:text-gray-200"
          >
            Return to home
          </button>
        </div>
      </div>
    )
  }

  if (!data?.gameState) return null

  return (
    <div className="relative">
      {isReconnecting && (
        <div className="fixed top-0 inset-x-0 z-50 bg-yellow-600 text-black text-center text-xs font-semibold py-1">
          Reconnecting…
        </div>
      )}
      {rouletteFlash && (
        <RouletteResultOverlay
          playerName={rouletteFlash.playerName}
          survived={rouletteFlash.survived}
          isMe={rouletteFlash.isMe}
          onDone={clearFlash}
        />
      )}
      <GameScreen gameState={data.gameState} playerId={playerId} joinCode={joinCode} />
    </div>
  )
}
