'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LandingPageInner() {
  const [playerName, setPlayerName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [joinMode, setJoinMode] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const savedName = localStorage.getItem('liars-bar-player-name') ?? ''
    if (savedName) setPlayerName(savedName)

    const code = searchParams.get('code')
    if (!code) return

    const upperCode = code.toUpperCase()
    setJoinMode(true)
    setJoinCode(upperCode)

    // Auto-join if the player already has a saved name
    if (savedName.trim().length > 0) {
      setIsLoading(true)
      setError('')
      fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: savedName.trim(), joinCode: upperCode }),
      })
        .then(async res => {
          if (!res.ok) {
            const err = await res.json()
            setError(err.error ?? 'Failed to join game')
            return
          }
          const data = await res.json()
          localStorage.setItem('liars-bar-player-id', data.playerId)
          localStorage.setItem('liars-bar-join-code', upperCode)
          router.push('/lobby')
        })
        .catch(() => setError('Network error — try again'))
        .finally(() => setIsLoading(false))
    }
  }, [searchParams, router])

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

  const validateName = (name: string): boolean => name.trim().length >= 1

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create game')
      }

      const data = await response.json()
      localStorage.setItem('liars-bar-player-id', data.playerId)
      localStorage.setItem('liars-bar-join-code', data.joinCode)
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
    if (!joinCode.trim()) {
      setError('Please enter a join code')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim(), joinCode: joinCode.toUpperCase() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to join game')
      }

      const data = await response.json()
      localStorage.setItem('liars-bar-player-id', data.playerId)
      localStorage.setItem('liars-bar-join-code', joinCode.toUpperCase())
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
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-500 mb-2">Liar's Bar</h1>
          <p className="text-gray-300 text-lg">A deadly game of bluff and chance</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 space-y-3">
          <h2 className="text-xl font-semibold text-white mb-3">How to Play</h2>
          <ul className="text-gray-300 space-y-2 text-sm">
            <li>• 2-6 players take turns playing cards face-down</li>
            <li>• Claim your cards match the Table Card</li>
            <li>• Call "Liar!" if you think someone is bluffing</li>
            <li>• Lose a challenge? Face the Russian Roulette...</li>
          </ul>
        </div>

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

          {joinMode && (
            <div>
              <label htmlFor="joinCode" className="block text-sm font-medium text-gray-300 mb-2">
                Join Code
              </label>
              <input
                id="joinCode"
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                className="input-field tracking-widest uppercase"
                maxLength={6}
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {!joinMode ? (
              <>
                <button
                  onClick={handleCreateGame}
                  disabled={!isNameValid || isLoading}
                  className="button-primary w-full"
                >
                  {isLoading ? 'Creating...' : 'Create New Game'}
                </button>
                <button
                  onClick={() => { setJoinMode(true); setError('') }}
                  disabled={isLoading}
                  className="button-secondary w-full"
                >
                  Join Existing Game
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleJoinGame}
                  disabled={!isNameValid || !joinCode.trim() || isLoading}
                  className="button-primary w-full"
                >
                  {isLoading ? 'Joining...' : 'Join'}
                </button>
                <button
                  onClick={() => { setJoinMode(false); setJoinCode(''); setError('') }}
                  disabled={isLoading}
                  className="button-secondary w-full"
                >
                  Back
                </button>
              </>
            )}
          </div>

          <div className="text-center">
            <p className="text-gray-500 text-xs">Names are saved locally for convenience</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    }>
      <LandingPageInner />
    </Suspense>
  )
}
