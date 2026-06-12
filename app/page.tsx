'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const [playerName, setPlayerName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Load saved name from localStorage on component mount
  useEffect(() => {
    const savedName = localStorage.getItem('liars-bar-player-name')
    if (savedName) {
      setPlayerName(savedName)
    }
  }, [])

  // Save name to localStorage whenever it changes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    setPlayerName(name)
    setError('')
    
    if (name.length > 0) {
      localStorage.setItem('liars-bar-player-name', name)
    } else {
      localStorage.removeItem('liars-bar-player-name')
    }
  }

  const validateName = (name: string): boolean => {
    return name.trim().length >= 1
  }

  const handleCreateGame = async () => {
    if (!validateName(playerName)) {
      setError('Please enter a valid name (at least 1 character)')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerName: playerName.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create game')
      }

      const data = await response.json()
      
      // Store player ID for subsequent requests
      localStorage.setItem('liars-bar-player-id', data.playerId)
      
      // Navigate to lobby
      router.push('/lobby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinGame = async () => {
    if (!validateName(playerName)) {
      setError('Please enter a valid name (at least 1 character)')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/game/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerName: playerName.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to join game')
      }

      const data = await response.json()
      
      // Store player ID for subsequent requests
      localStorage.setItem('liars-bar-player-id', data.playerId)
      
      // Navigate to lobby
      router.push('/lobby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
    } finally {
      setIsLoading(false)
    }
  }

  const isNameValid = validateName(playerName)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        {/* Game Title */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-500 mb-2">Liar's Bar</h1>
          <p className="text-gray-300 text-lg">
            A deadly game of bluff and chance
          </p>
        </div>

        {/* Game Description */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-3">
          <h2 className="text-xl font-semibold text-white mb-3">How to Play</h2>
          <ul className="text-gray-300 space-y-2 text-sm">
            <li>• 2-6 players take turns playing cards face-down</li>
            <li>• Claim your cards match the Table Card</li>
            <li>• Call "Liar!" if you think someone is bluffing</li>
            <li>• Lose a challenge? Face the Russian Roulette...</li>
          </ul>
        </div>

        {/* Name Entry Form */}
        <div className="space-y-4">
          <div>
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-300 mb-2">
              Enter your name
            </label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={handleNameChange}
              placeholder="Your name"
              className="input-field"
              maxLength={20}
              disabled={isLoading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleCreateGame}
              disabled={!isNameValid || isLoading}
              className="button-primary w-full"
            >
              {isLoading ? 'Creating...' : 'Create New Game'}
            </button>
            
            <button
              onClick={handleJoinGame}
              disabled={!isNameValid || isLoading}
              className="button-secondary w-full"
            >
              {isLoading ? 'Joining...' : 'Join Existing Game'}
            </button>
          </div>

          {/* Help Text */}
          <div className="text-center">
            <p className="text-gray-500 text-xs">
              Names are saved locally for convenience
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}