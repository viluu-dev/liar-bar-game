'use client'

import type { ProjectedPlayer, TableCard } from '@/lib/types'
import { rotateToEgocentric, computeSeatPosition } from '@/lib/seat-layout'
import PlayedPile from './PlayedPile'
import PlayerSeat from './PlayerSeat'

interface RoundTableProps {
  players: ProjectedPlayer[]
  myIndex: number
  myPlayerId: string
  activePlayerId: string | null
  roulettePlayerIds: string[]
  roulettePhaseStartedAt: number | null
  pileCount: number
  tableCard: TableCard | null
  roundNumber: number
}

export default function RoundTable({
  players,
  myIndex,
  myPlayerId,
  activePlayerId,
  roulettePlayerIds,
  roulettePhaseStartedAt,
  pileCount,
  tableCard,
  roundNumber,
}: RoundTableProps) {
  const seatedPlayers = rotateToEgocentric(players, myIndex)

  return (
    <div className="relative w-full aspect-square max-w-sm mx-auto">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <PlayedPile pileCount={pileCount} tableCard={tableCard} roundNumber={roundNumber} />
      </div>

      {seatedPlayers.map((player, i) => {
        const { xPct, yPct } = computeSeatPosition(i, seatedPlayers.length)
        return (
          <div
            key={player.id}
            className="absolute"
            style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}
          >
            <PlayerSeat
              player={player}
              isMe={player.id === myPlayerId}
              isActive={player.id === activePlayerId}
              isPendingShooter={roulettePlayerIds.includes(player.id)}
              roulettePhaseStartedAt={roulettePhaseStartedAt}
              position={players.indexOf(player) + 1}
            />
          </div>
        )
      })}
    </div>
  )
}
