/**
 * Ably push layer — server-only. Redis remains the source of truth;
 * this module only broadcasts a lightweight "something changed" signal
 * so clients can refetch the already-safe, already-projected game state
 * sooner than the polling fallback interval would.
 *
 * Publish-only: never import Ably.Realtime here. The server has no need
 * to hold a persistent WebSocket connection, only to fire REST publishes.
 */

import Ably from 'ably'

const PUBLISH_TIMEOUT_MS = 2000

// Sentinel pattern mirrors getRedisClient() in lib/redis.ts: `undefined` means
// "not yet resolved", `null` means "resolved as unconfigured" — these must be
// distinct so a missing env var doesn't retry client construction on every call.
let ablyClient: Ably.Rest | null | undefined

function getAblyClient(): Ably.Rest | null {
  if (ablyClient !== undefined) return ablyClient

  const key = process.env.ABLY_API_KEY
  if (!key) {
    console.warn('[realtime] ABLY_API_KEY not set — push disabled, polling fallback only')
    ablyClient = null
    return null
  }

  try {
    ablyClient = new Ably.Rest({ key })
  } catch (error) {
    console.warn('[realtime] Failed to create Ably client', error)
    ablyClient = null
  }
  return ablyClient
}

/** Exposed for the token-minting route, which needs the same configured client. */
export function getAblyRestClient(): Ably.Rest | null {
  return getAblyClient()
}

export function gameChannelName(joinCode: string): string {
  return `game:${joinCode}`
}

function timeout(ms: number): Promise<void> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('Ably publish timed out')), ms))
}

/**
 * Publish a "version changed" signal for a game. Never throws — a publish
 * failure must not fail a request whose Redis write already succeeded;
 * clients fall back to polling if push never arrives.
 */
export async function publishGameUpdate(joinCode: string, version: number): Promise<void> {
  const client = getAblyClient()
  if (!client) return

  try {
    const channel = client.channels.get(gameChannelName(joinCode))
    await Promise.race([channel.publish('update', { version }), timeout(PUBLISH_TIMEOUT_MS)])
  } catch (error) {
    console.warn(`[realtime] Failed to publish update (joinCode=${joinCode})`, error)
  }
}
