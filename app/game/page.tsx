'use client'

import { useState } from 'react'
import GameScreen from '@/components/GameScreen'
import { ProjectedGameState } from '@/lib/types'

// Mock data for testing the UI components
const mockGameState: ProjectedGameState = {
  status: 'playing',
  players: [
    {
      id: 'player-1',
      name: 'Alice',
      handCount: 5,
      isAlive: true,
      isSafe: false,
      isHost: true,
      joinedAt: Date.now() - 300000,
      lastSeenAt: Date.now()
    },
    {
      id: 'player-2', 
      name: 'Bob',
      handCount: 3,
      isAlive: true,
      isSafe: false,
      isHost: false,
      joinedAt: Date.now() - 250000,
      lastSeenAt: Date.now()
    },
    {
      id: 'player-3',
      name: 'Charlie',
      handCount: 4,
      isAlive: true,
      isSafe: false,
      isHost: false,
      joinedAt: Date.now() - 200000,
      lastSeenAt: Date.now()
    },
    {
      id: 'player-4',
      name: 'Diana',
      handCount: 0,
      isAlive: false,
      isSafe: false,
      isHost: false,
      joinedAt: Date.now() - 150000,
      lastSeenAt: Date.now() - 30000
    }
  ],
  myHand: ['ACE', 'KING', 'QUEEN', 'JOKER', 'ACE'],
  tableCard: 'KING',
  pileCount: 7,
  currentPlayerIndex: 0,
  challengerIndex: null,
  lastPlay: {
    playerId: 'player-2',
    playerName: 'Bob',
    claimedCount: 2,
    claimedCard: 'KING'
  },
  roulettePlayerId: null,
  roundNumber: 2,
  winnerId: null,
  version: 42
}

export default function GamePage() {
  const [mockPlayerId] = useState('player-1')

  // For now, show mock data. Later this will be replaced with real game state polling
  return <GameScreen gameState={mockGameState} playerId={mockPlayerId} />
}