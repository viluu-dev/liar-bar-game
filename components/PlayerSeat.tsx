'use client'

import { ProjectedPlayer } from '@/lib/types'
import ChamberDots from './ChamberDots'
import TriggerTimer from './TriggerTimer'

interface PlayerSeatProps {
  player: ProjectedPlayer
  isMe: boolean
  isActive: boolean
  isPendingShooter: boolean
  roulettePhaseStartedAt: number | null
  position: number
}

export default function PlayerSeat({
  player,
  isMe,
  isActive,
  isPendingShooter,
  roulettePhaseStartedAt,
  position,
}: PlayerSeatProps) {
  const getStatusIcon = () => {
    if (!player.isAlive) return '💀'
    if (player.isSafe) return '🛡️'
    if (player.isHost) return '👑'
    return null
  }

  return (
    <div className="flex flex-col items-center gap-1 w-16">
      <div className="relative w-12 h-12">
        {isPendingShooter && roulettePhaseStartedAt !== null && (
          <TriggerTimer phaseStartedAt={roulettePhaseStartedAt} size="ring" />
        )}
        <div
          className={`
            relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold
            transition-all duration-200
            ${isMe ? 'bg-blue-600' : 'bg-gray-700'}
            ${isActive && player.isAlive ? 'ring-2 ring-yellow-400 ring-opacity-70 shadow-lg shadow-yellow-400/30' : ''}
            ${isPendingShooter ? 'ring-2 ring-red-500 animate-pulse' : ''}
            ${!player.isAlive ? 'opacity-50 grayscale' : ''}
          `}
        >
          {position}
          {getStatusIcon() && (
            <span className="absolute -top-1 -right-1 text-sm leading-none">{getStatusIcon()}</span>
          )}
        </div>
      </div>

      <div className="text-xs font-semibold text-center truncate w-full">
        {isMe ? 'You' : player.name}
      </div>

      {player.isAlive && player.chamberIndex !== undefined && (
        <ChamberDots chamberIndex={player.chamberIndex} size="sm" />
      )}

      {player.isAlive && !player.isSafe && (
        <div className="min-w-[20px] h-4 px-1 rounded-full bg-gray-800 border border-gray-600 text-[10px] text-gray-300 flex items-center justify-center">
          {player.handCount}
        </div>
      )}
    </div>
  )
}
