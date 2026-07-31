'use client'

import { useState } from 'react'
import { getDeckComposition } from '@/lib/game-logic'

interface HelpButtonProps {
  playerCount?: number
  bullets?: number
  devilMode?: boolean
}

const CARD_LABELS: Record<string, string> = {
  ACE: 'Ace',
  KING: 'King',
  QUEEN: 'Queen',
  JOKER: 'Joker',
  DEVIL: 'Devil',
}
const CARDS_PER_HAND = 5

export default function HelpButton({ playerCount, bullets, devilMode }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const composition = getDeckComposition(playerCount ?? 4, devilMode ?? false)
  const deckSize = composition.reduce((sum, c) => sum + c.count, 0)
  const cardsDealt = playerCount ? playerCount * CARDS_PER_HAND : null
  const cardsRemaining = cardsDealt !== null ? deckSize - cardsDealt : null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="How to play"
        className="fixed top-3 right-3 z-40 w-10 h-10 rounded-full bg-gray-800 border border-gray-600 text-gray-200 font-bold hover:bg-gray-700 transition-colors"
      >
        ?
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[85vh] overflow-y-auto space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">How to Play</h2>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-white text-xl leading-none min-h-[44px] min-w-[44px]"
              >
                ×
              </button>
            </div>

            <ul className="text-gray-300 space-y-2 text-sm list-disc list-inside">
              <li>2-8 players are each dealt 5 cards; the deck scales in size with the table.</li>
              <li>Each round has a Table Card (Ace, King, or Queen).</li>
              <li>On your turn, play 1-3 cards face-down, claiming they all match the Table Card. Jokers count as any card.</li>
              <li>The next player either Believes (play passes to them) or calls Liar.</li>
              <li>Calling Liar reveals the cards: if the play was honest, the challenger pulls the trigger; if it was a bluff, the bluffer does.</li>
              <li>Pulling the trigger risks elimination — survive and the round continues.</li>
              <li>Emptying your hand makes you safe for the rest of the round.</li>
              <li>Last player alive wins.</li>
              {devilMode && (
                <li>😈 Devil Mode: one Devil Card is in play. It must be played alone and always counts as a match. If challenged, the challenge fails and every other player must pull the trigger.</li>
              )}
            </ul>

            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-white mb-2">Deck composition ({deckSize} cards)</h3>
              <ul className="text-gray-400 text-sm space-y-1">
                {composition.map(c => (
                  <li key={c.card} className="flex justify-between">
                    <span>{CARD_LABELS[c.card]}</span>
                    <span>{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {playerCount != null && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-white mb-2">Current game setup</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li className="flex justify-between">
                    <span>Players</span>
                    <span>{playerCount}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Cards dealt ({playerCount} × 5)</span>
                    <span>{cardsDealt}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Cards left in deck</span>
                    <span>{cardsRemaining}</span>
                  </li>
                  {bullets != null && (
                    <li className="flex justify-between">
                      <span>Bullets per chamber</span>
                      <span>{bullets} / 6</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
