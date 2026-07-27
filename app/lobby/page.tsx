'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useGameChannel } from '@/lib/useGameChannel'
import HelpButton from '@/components/HelpButton'
import type { GameStateResponse, GameActionResponse } from '@/lib/types'

async function fetchGameState(playerId: string, joinCode: string): Promise<GameStateResponse> {
  const response = await fetch(`/api/game/state?playerId=${playerId}&code=${joinCode}`)
  if (!response.ok) throw new Error('Failed to fetch game state')
  return response.json()
}

export default function LobbyPage() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)
  const [error, setError] = useState('')
  const [pendingBullets, setPendingBullets] = useState(1)
  const [copySuccess, setCopySuccess] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const savedPlayerId = localStorage.getItem('liars-bar-player-id')
    const savedJoinCode = localStorage.getItem('liars-bar-join-code')
    if (!savedPlayerId || !savedJoinCode) {
      router.push('/')
      return
    }
    setPlayerId(savedPlayerId)
    setJoinCode(savedJoinCode)
  }, [router])

  useGameChannel(joinCode, playerId)

  const { data: gameData, error: fetchError, isLoading, mutate } = useSWR(
    playerId && joinCode ? ['gameState', playerId, joinCode] : null,
    () => fetchGameState(playerId!, joinCode!),
    {
      refreshInterval: 12000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onError: (err) => {
        console.error('Game state fetch error:', err)
        setError('Failed to connect to game. Retrying...')
      },
      onSuccess: () => setError('')
    }
  )

  useEffect(() => {
    if (gameData?.phase === 'none') {
      localStorage.removeItem('liars-bar-player-id')
      localStorage.removeItem('liars-bar-join-code')
      router.push('/')
    }
  }, [gameData, router])

  useEffect(() => {
    if (gameData?.gameState?.status === 'playing') {
      router.push('/game')
    }
  }, [gameData, router])

  useEffect(() => {
    if (gameData?.gameState?.settings?.bullets) {
      setPendingBullets(gameData.gameState.settings.bullets)
    }
  }, [gameData?.gameState?.settings?.bullets])

  const handleStartGame = async () => {
    if (!playerId || !joinCode) return

    setIsStarting(true)
    setError('')

    try {
      const response = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, joinCode, bullets: pendingBullets }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start game')
      }

      const result: GameActionResponse = await response.json()
      if (!result.success) throw new Error('Failed to start game')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
    } finally {
      setIsStarting(false)
    }
  }

  const handleShuffleSeating = async () => {
    if (!playerId || !joinCode) return

    setIsShuffling(true)
    setError('')

    try {
      const response = await fetch('/api/game/shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, joinCode }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to shuffle seating')
      }

      const result: GameActionResponse = await response.json()
      if (!result.success) throw new Error('Failed to shuffle seating')

      mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to shuffle seating')
    } finally {
      setIsShuffling(false)
    }
  }

  const handleKickPlayer = async (targetId: string) => {
    if (!playerId || !joinCode) return
    try {
      const response = await fetch('/api/game/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, targetId, joinCode }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to kick player')
      }
      mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick player')
    }
  }

  const handleCopyLink = async () => {
    if (!gameData?.gameState?.joinCode) return
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?code=${gameData.gameState.joinCode}`
      )
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      setError('Failed to copy link')
    }
  }

  if (!playerId || isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <HelpButton />
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading lobby...</p>
        </div>
      </div>
    )
  }

  if (fetchError || !gameData?.gameState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <HelpButton />
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-4">Connection Error</h1>
          <p className="text-gray-300 mb-4">
            {error || 'Unable to connect to game. Please try again.'}
          </p>
          <button onClick={() => router.push('/')} className="button-primary">
            Return to Home
          </button>
        </div>
      </div>
    )
  }

  const { gameState } = gameData
  const { players } = gameState
  const currentPlayer = players.find(p => p.id === playerId)
  const isHost = currentPlayer?.isHost ?? false
  const playerCount = players.length
  const canStartGame = isHost && playerCount >= 2 && !isStarting

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <HelpButton playerCount={playerCount} bullets={pendingBullets} />
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-2">Game Lobby</h1>
          <p className="text-gray-300">Waiting for players to join...</p>
        </div>

        {/* Join code display */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs mb-1">Join Code</p>
              <p className="text-white text-2xl font-bold tracking-widest">
                {gameState.joinCode}
              </p>
            </div>
            <button
              onClick={handleCopyLink}
              className="min-h-[44px] px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
            >
              {copySuccess ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <h2 className="text-xl font-semibold text-white mb-2">
            Players ({playerCount}/6)
          </h2>
          <p className="text-gray-400 text-sm">
            {playerCount < 2
              ? 'Need at least 2 players to start'
              : `${6 - playerCount} more players can join`
            }
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Players in Lobby</h3>
            {isHost && playerCount >= 2 && (
              <button
                onClick={handleShuffleSeating}
                disabled={isShuffling || isStarting}
                className="min-h-[44px] px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm rounded-lg transition-colors"
              >
                {isShuffling ? 'Shuffling...' : 'Shuffle Seats'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {players.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.id === playerId
                    ? 'bg-red-900 border border-red-600'
                    : 'bg-gray-700'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-white font-medium">
                    {player.name}
                    {player.id === playerId && (
                      <span className="text-red-400 text-sm ml-1">(You)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {player.isHost && (
                    <span className="bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded-full font-medium">
                      Host
                    </span>
                  )}
                  <span className="text-gray-400 text-xs">#{index + 1}</span>
                  {isHost && player.id !== playerId && (
                    <button
                      onClick={() => handleKickPlayer(player.id)}
                      className="min-h-[44px] px-3 text-xs bg-red-800 hover:bg-red-700 text-red-200 rounded-lg transition-colors"
                    >
                      Kick
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {isHost && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Roulette bullets (1-5)
              </label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setPendingBullets(n)}
                    className={`flex-1 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                      pendingBullets === n
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleStartGame}
              disabled={!canStartGame}
              className="button-primary w-full"
            >
              {isStarting
                ? 'Starting Game...'
                : playerCount < 2
                  ? 'Need at least 2 players'
                  : 'Start Game'
              }
            </button>

            {playerCount < 2 && (
              <p className="text-center text-gray-500 text-sm">
                Ask friends to join using the code above
              </p>
            )}
          </div>
        )}

        {!isHost && (
          <div className="text-center space-y-3">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="animate-pulse w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-white font-medium">Waiting for host</span>
              </div>
              <p className="text-gray-400 text-sm">
                {players.find(p => p.isHost)?.name || 'The host'} will start the game
              </p>
            </div>
          </div>
        )}

        <div className="text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-gray-500 text-xs">
              Connected
            </span>
          </div>
        </div>

        <div className="text-center pt-4">
          <button
            onClick={() => {
              localStorage.removeItem('liars-bar-player-id')
              localStorage.removeItem('liars-bar-join-code')
              router.push('/')
            }}
            className="text-gray-500 hover:text-gray-300 text-sm underline"
          >
            Leave Game
          </button>
        </div>
      </div>
    </div>
  )
}
