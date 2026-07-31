'use client'

import { useEffect, useState } from 'react'
import { ROULETTE_COUNTDOWN_MS } from '@/lib/constants'

interface TriggerTimerProps {
  phaseStartedAt: number // gameState.roulettePhaseStartedAt from the server
  durationMs?: number // defaults to ROULETTE_COUNTDOWN_MS
  size?: 'ring' | 'inline'
}

const TICK_MS = 150

// Display-only: enforcement happens server-side (autoPullIfRouletteExpired).
// remainingMs is re-derived from the server-anchored phaseStartedAt on every
// tick rather than cached at mount, so a late mount (Ably push delay,
// backgrounded tab) never drifts — it's always correct relative to the
// server, and simply clamps to 0 until the next poll/Ably refetch confirms
// the real outcome.
function useRemainingMs(phaseStartedAt: number, durationMs: number): number {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, durationMs - (Date.now() - phaseStartedAt))
  )

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, durationMs - (Date.now() - phaseStartedAt)))
    tick()
    const interval = setInterval(tick, TICK_MS)
    return () => clearInterval(interval)
  }, [phaseStartedAt, durationMs])

  return remainingMs
}

export default function TriggerTimer({ phaseStartedAt, durationMs = ROULETTE_COUNTDOWN_MS, size = 'inline' }: TriggerTimerProps) {
  const remainingMs = useRemainingMs(phaseStartedAt, durationMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const fraction = durationMs > 0 ? remainingMs / durationMs : 0

  if (size === 'ring') {
    const strokeWidth = 3
    const radius = 22
    const circumference = 2 * Math.PI * radius
    const offset = circumference * (1 - fraction)

    return (
      <svg
        className="absolute inset-0 -rotate-90 pointer-events-none"
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth={strokeWidth} />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#ef4444"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-150 ease-linear"
        />
      </svg>
    )
  }

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-red-400">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span>{remainingMs > 0 ? `${remainingSec}s` : '…'}</span>
    </div>
  )
}
