'use client'

import { ProjectedGameState } from '@/lib/types'
import TableCard from './TableCard'
import PlayersList from './PlayersList'
import CardHand from './CardHand'
import GameStatus from './GameStatus'

interface GameScreenProps {
  gameState: ProjectedGameState
  playerId: string
}

export default function GameScreen({ gameState, playerId }: GameScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col">
      {/* Game Status Bar */}
      <div className="shrink-0 p-4 border-b border-gray-700">
        <GameStatus gameState={gameState} playerId={playerId} />
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col p-4 space-y-6">
        {/* Table Card - Prominent at top */}
        <div className="shrink-0">
          <TableCard 
            card={gameState.tableCard} 
            pileCount={gameState.pileCount}
            roundNumber={gameState.roundNumber}
          />
        </div>

        {/* Players List - Middle section */}
        <div className="flex-1 min-h-0">
          <PlayersList 
            players={gameState.players}
            currentPlayerId={playerId}
            currentPlayerIndex={gameState.currentPlayerIndex}
          />
        </div>
      </div>

      {/* Card Hand - Bottom fixed */}
      <div className="shrink-0 p-4 border-t border-gray-700">
        <CardHand 
          cards={gameState.myHand}
          isMyTurn={gameState.players[gameState.currentPlayerIndex]?.id === playerId}
          gameStatus={gameState.status}
        />
      </div>
    </div>
  )
}