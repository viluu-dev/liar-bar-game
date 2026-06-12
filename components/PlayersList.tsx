'use client'

import { ProjectedPlayer } from '@/lib/types'

interface PlayersListProps {
  players: ProjectedPlayer[]
  currentPlayerId: string
  currentPlayerIndex: number
}

export default function PlayersList({ 
  players, 
  currentPlayerId, 
  currentPlayerIndex 
}: PlayersListProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="text-center text-sm text-gray-400 mb-4 shrink-0">
        Players ({players.length}/6)
      </div>
      
      <div className="flex-1 space-y-3 overflow-y-auto">
        {players.map((player, index) => (
          <PlayerCard 
            key={player.id}
            player={player}
            isCurrentPlayer={player.id === currentPlayerId}
            isActivePlayer={index === currentPlayerIndex}
            position={index + 1}
          />
        ))}
      </div>
    </div>
  )
}

interface PlayerCardProps {
  player: ProjectedPlayer
  isCurrentPlayer: boolean
  isActivePlayer: boolean
  position: number
}

function PlayerCard({ player, isCurrentPlayer, isActivePlayer, position }: PlayerCardProps) {
  const getStatusIcon = () => {
    if (!player.isAlive) return '💀'
    if (player.isSafe) return '🛡️'
    if (player.isHost) return '👑'
    return null
  }

  const getStatusText = () => {
    if (!player.isAlive) return 'Eliminated'
    if (player.isSafe) return 'Safe this round'
    if (isActivePlayer) return "It's their turn"
    return `${player.handCount} cards`
  }

  return (
    <div 
      className={`
        rounded-lg p-4 border-2 transition-all duration-200
        ${isCurrentPlayer 
          ? 'bg-blue-900/30 border-blue-500' 
          : 'bg-gray-800 border-gray-600'
        }
        ${isActivePlayer && player.isAlive 
          ? 'ring-2 ring-yellow-400 ring-opacity-50 shadow-lg' 
          : ''
        }
        ${!player.isAlive 
          ? 'opacity-50 grayscale' 
          : ''
        }
      `}
    >
      <div className="flex items-center justify-between">
        {/* Player Info */}
        <div className="flex items-center space-x-3">
          <div 
            className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${isCurrentPlayer 
                ? 'bg-blue-600' 
                : 'bg-gray-600'
              }
            `}
          >
            {position}
          </div>
          
          <div>
            <div className="font-semibold flex items-center space-x-2">
              <span>{isCurrentPlayer ? 'You' : player.name}</span>
              {getStatusIcon() && (
                <span className="text-lg">{getStatusIcon()}</span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {getStatusText()}
            </div>
          </div>
        </div>

        {/* Card Count Display */}
        {player.isAlive && !player.isSafe && (
          <div className="flex space-x-1">
            {Array.from({ length: player.handCount }, (_, i) => (
              <div 
                key={i}
                className="w-6 h-8 bg-gray-700 border border-gray-600 rounded-sm"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}