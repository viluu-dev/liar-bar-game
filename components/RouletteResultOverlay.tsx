'use client'

import { useEffect, useState } from 'react'

interface RouletteResultOverlayProps {
  playerName: string
  survived: boolean
  isMe: boolean
  onDone: () => void
}

export default function RouletteResultOverlay({
  playerName,
  survived,
  isMe,
  onDone,
}: RouletteResultOverlayProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300) // wait for fade-out
    }, 2000)
    return () => clearTimeout(timer)
  }, [onDone])

  const headline = survived
    ? isMe ? 'YOU SURVIVED' : `${playerName} SURVIVED`
    : isMe ? 'YOU WERE ELIMINATED' : `${playerName} ELIMINATED`

  const emoji = survived ? '✓' : '💀'

  return (
    <div
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center
        transition-opacity duration-300
        ${visible ? 'opacity-100' : 'opacity-0'}
        ${survived ? 'bg-black/95' : 'bg-black/98'}
      `}
    >
      <div className="text-center space-y-6 px-8">
        <div
          className={`
            text-8xl font-bold animate-pulse
            ${survived ? 'text-green-400' : 'text-red-500'}
          `}
        >
          {emoji}
        </div>

        <h1
          className={`
            text-4xl font-black tracking-widest uppercase
            ${survived ? 'text-green-400' : 'text-red-500'}
          `}
        >
          {headline}
        </h1>

        {!isMe && (
          <p className="text-gray-400 text-lg">
            {survived ? 'Lucky...' : 'Better luck next life.'}
          </p>
        )}
      </div>
    </div>
  )
}
