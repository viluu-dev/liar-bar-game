'use client'

import { ProjectedGameState } from '@/lib/types'

interface GameStatusProps {
  gameState: ProjectedGameState
  playerId: string
}

export default function GameStatus({ gameState, playerId }: GameStatusProps) {
  const getCurrentPlayer = () => {
    return gameState.players[gameState.currentPlayerIndex]
  }

  const isMyTurn = () => {
    return getCurrentPlayer()?.id === playerId
  }

  const getStatusMessage = () => {
    const currentPlayer = getCurrentPlayer()
    
    switch (gameState.status) {
      case 'lobby':
        return 'Waiting in lobby...'
      
      case 'playing':
        if (isMyTurn()) {
          return 'Your turn - select cards to play'
        } else if (currentPlayer) {
          return `${currentPlayer.name}'s turn`
        }
        return 'Game in progress'
      
      case 'challenge':
        if (gameState.challengerIndex !== null) {
          const challenger = gameState.players[gameState.challengerIndex]
          if (challenger?.id === playerId) {
            return 'Your choice - Believe or call Liar?'
          } else if (challenger) {
            return `${challenger.name} must decide: Believe or Liar?`
          }
        }
        return 'Challenge in progress'
      
      case 'roulette':
        if (gameState.roulettePlayerId === playerId) {
          return 'Your fate awaits - click the trigger'
        } else if (gameState.roulettePlayerId) {
          const roulettePlayer = gameState.players.find(p => p.id === gameState.roulettePlayerId)
          return `${roulettePlayer?.name || 'Someone'} must face the roulette`
        }
        return 'Roulette in progress'
      
      case 'finished':
        if (gameState.winnerId === playerId) {
          return '🎉 You won! Congratulations!'
        } else if (gameState.winnerId) {
          const winner = gameState.players.find(p => p.id === gameState.winnerId)
          return `${winner?.name || 'Someone'} won the game!`
        }
        return 'Game finished'
      
      default:
        return 'Unknown game status'
    }
  }

  const getLastPlayMessage = () => {
    if (!gameState.lastPlay) return null
    
    const { playerName, claimedCount, claimedCard } = gameState.lastPlay
    return `${playerName} played ${claimedCount} ${claimedCard}${claimedCount > 1 ? 's' : ''}`
  }

  return (
    <div className="text-center">
      {/* Main Status */}
      <div className={`
        text-lg font-semibold mb-1
        ${isMyTurn() ? 'text-yellow-400' : 'text-white'}
      `}>
        {getStatusMessage()}
      </div>
      
      {/* Last Play */}
      {getLastPlayMessage() && (
        <div className="text-sm text-gray-400">
          Last play: {getLastPlayMessage()}
        </div>
      )}
      
      <div className="text-xs text-gray-500 mt-1">
        {gameState.players.filter(p => p.isAlive).length} alive
      </div>
    </div>
  )
}