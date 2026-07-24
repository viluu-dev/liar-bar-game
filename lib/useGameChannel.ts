'use client'

import { useEffect } from 'react'
import { useSWRConfig } from 'swr'
import type * as AblyNamespace from 'ably'

/**
 * Loaded via Ably's official CDN script rather than the `ably` npm package,
 * because Next.js's client-component bundler (the "use client" flight loader)
 * currently fails to parse a `super(...)`-inside-arrow-function pattern used
 * intentionally in Ably's ErrorInfo class (both the full and modular browser
 * builds hit this). The `ably` package itself stays a real dependency — used
 * server-side in lib/realtime.ts, which isn't affected — this only avoids
 * pulling its browser bundle into the client build.
 */
declare global {
  interface Window {
    Ably?: typeof AblyNamespace
  }
}

const ABLY_CDN_SRC = 'https://cdn.ably.com/lib/ably.min-2.js'
let ablyScriptPromise: Promise<typeof AblyNamespace> | null = null

function loadAblyScript(): Promise<typeof AblyNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadAblyScript called outside the browser'))
  }
  if (window.Ably) return Promise.resolve(window.Ably)
  if (ablyScriptPromise) return ablyScriptPromise

  ablyScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ABLY_CDN_SRC}"]`)
    const script = existing ?? document.createElement('script')

    script.addEventListener('load', () => {
      if (window.Ably) resolve(window.Ably)
      else reject(new Error('Ably script loaded but window.Ably is undefined'))
    })
    script.addEventListener('error', () => reject(new Error('Failed to load Ably script')))

    if (!existing) {
      script.src = ABLY_CDN_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })

  return ablyScriptPromise
}

/**
 * Subscribes to the Ably channel for a game and triggers an SWR refetch as
 * soon as a push update arrives, instead of waiting for the next poll tick.
 *
 * Deliberately duplicates the `game:{joinCode}` channel-naming convention
 * rather than importing it from lib/realtime.ts — that module is server-only
 * (reads ABLY_API_KEY, uses the Ably REST client) and must not be pulled
 * into the client bundle.
 *
 * Never throws: if the Ably script or connection can't be established, the
 * caller's own SWR `refreshInterval` fallback remains the only update path,
 * which must be enough to keep the game playable on its own.
 */
export function useGameChannel(joinCode: string | null, playerId: string | null): void {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    if (!joinCode || !playerId) return

    const key = ['gameState', playerId, joinCode]
    let cancelled = false
    let realtime: InstanceType<typeof AblyNamespace.Realtime> | null = null

    loadAblyScript()
      .then((Ably) => {
        if (cancelled) return

        realtime = new Ably.Realtime({
          authUrl: '/api/ably-token',
          authParams: { joinCode, playerId },
          authMethod: 'GET',
        })

        const channel = realtime.channels.get(`game:${joinCode}`)
        let hasConnectedOnce = false

        channel.subscribe('update', () => {
          void mutate(key)
        })

        realtime.connection.on('connected', () => {
          // Catch anything missed while disconnected/reconnecting.
          if (hasConnectedOnce) void mutate(key)
          hasConnectedOnce = true
        })
        realtime.connection.on('failed', (stateChange) => {
          console.warn('[useGameChannel] connection failed', stateChange.reason)
        })
      })
      .catch((error) => {
        console.warn('[useGameChannel] failed to load Ably', error)
      })

    return () => {
      cancelled = true
      realtime?.close()
    }
  }, [joinCode, playerId, mutate])
}
