'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import type { GameStateResponse, GameActionResponse } from '@/lib/types'

// SWR fetcher function for game state polling
async function fetchGameState(playerId: string): Promise<GameStateResponse> {
  const response = await fetch(`/api/game/state?playerId=${playerId}`)
  
  if (!response.ok) {
    throw new Error('Failed to fetch game state')
  }
  
  return response.json()
}

export default function LobbyPage() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Load player ID from localStorage on component mount
  useEffect(() => {
    const savedPlayerId = localStorage.getItem('liars-bar-player-id')
    if (!savedPlayerId) {
      // No player ID found, redirect back to landing page
      router.push('/')
      return
    }
    setPlayerId(savedPlayerId)
  }, [router])

  // SWR polling with 2-second refresh interval
  const { data: gameData, error: fetchError, isLoading } = useSWR(
    playerId ? ['gameState', playerId] : null,
    () => fetchGameState(playerId!),
    {
      refreshInterval: 2000, // 2-second polling as required
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onError: (err) => {
        console.error('Game state fetch error:', err)
        setError('Failed to connect to game. Retrying...')
      },
      onSuccess: () => {
        setError('') // Clear error on successful fetch
      }
    }
  )

  // Handle case where no game exists
  useEffect(() => {
    if (gameData?.phase === 'none') {
      // No active game, redirect back to landing page
      localStorage.removeItem('liars-bar-player-id')
      router.push('/')
    }
  }, [gameData, router])

  // Navigate to game screen when game starts
  useEffect(() => {
    if (gameData?.gameState?.status === 'playing') {
      router.push('/game')
    }
  }, [gameData, router])

  const handleStartGame = async () => {
    if (!playerId) return

    setIsStarting(true)
    setError('')

    try {
      const response = await fetch('/api/game/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start game')
      }

      const result: GameActionResponse = await response.json()
      
      if (result.success) {
        // Game started successfully, navigation will happen via useEffect
        // when the game state updates to 'playing'
      } else {
        throw new Error('Failed to start game')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
    } finally {
      setIsStarting(false)
    }
  }

  // Show loading state while fetching player ID or initial game state
  if (!playerId || isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading lobby...</p>
        </div>
      </div>
    )
  }

  // Handle fetch errors or missing game data
  if (fetchError || !gameData?.gameState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-4">Connection Error</h1>
          <p className="text-gray-300 mb-4">
            {error || 'Unable to connect to game. Please try again.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="button-primary"
          >
            Return to Home
          </button>
        </div>
      </div>
    )
  }

  const { gameState } = gameData
  const { players } = gameState
  
  // Find current player and determine if they're the host
  const currentPlayer = players.find(p => p.id === playerId)
  const isHost = currentPlayer?.isHost ?? false
  const playerCount = players.length

  // Host can start game only with 2+ players
  const canStartGame = isHost && playerCount >= 2 && !isStarting

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Game Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-2">Game Lobby</h1>
          <p className="text-gray-300">
            Waiting for players to join...
          </p>
        </div>

        {/* Player Count Display */}
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

        {/* Live Player List */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Players in Lobby</h3>
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
                  <span className="text-gray-400 text-xs">
                    #{index + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Host Controls */}
        {isHost && (
          <div className="space-y-3">
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
                Ask friends to join by entering your game code or sharing the link
              </p>
            )}
          </div>
        )}

        {/* Non-Host Waiting State */}
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

        {/* Connection Status */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-gray-500 text-xs">
              Connected • Refreshing every 2 seconds
            </span>
          </div>
        </div>

        {/* Back to Home Button */}
        <div className="text-center pt-4">
          <button
            onClick={() => {
              localStorage.removeItem('liars-bar-player-id')
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