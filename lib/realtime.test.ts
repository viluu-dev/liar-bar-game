/**
 * Tests for the Ably push layer. These verify publishGameUpdate never
 * throws and targets the right channel — not Ably's own behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockPublish = vi.fn()
const mockCreateTokenRequest = vi.fn()
const mockRestInstance = {
  channels: { get: vi.fn(() => ({ publish: mockPublish })) },
  auth: { createTokenRequest: mockCreateTokenRequest },
}
const MockRest = vi.fn(() => mockRestInstance)

vi.mock('ably', () => ({
  default: { Rest: MockRest },
}))

describe('lib/realtime', () => {
  const ORIGINAL_KEY = process.env.ABLY_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.ABLY_API_KEY
    } else {
      process.env.ABLY_API_KEY = ORIGINAL_KEY
    }
  })

  it('no-ops without throwing when ABLY_API_KEY is unset', async () => {
    delete process.env.ABLY_API_KEY
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { publishGameUpdate } = await import('./realtime')
    await expect(publishGameUpdate('ABCD', 1)).resolves.toBeUndefined()

    expect(MockRest).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ABLY_API_KEY not set')
    )
  })

  it('publishes an update to the correctly named channel when configured', async () => {
    process.env.ABLY_API_KEY = 'app.key:secret'
    mockPublish.mockResolvedValueOnce(undefined)

    const { publishGameUpdate } = await import('./realtime')
    await publishGameUpdate('ABCD', 3)

    expect(mockRestInstance.channels.get).toHaveBeenCalledWith('game:ABCD')
    expect(mockPublish).toHaveBeenCalledWith('update', { version: 3 })
  })

  it('resolves without throwing when the channel publish rejects', async () => {
    process.env.ABLY_API_KEY = 'app.key:secret'
    mockPublish.mockRejectedValueOnce(new Error('network error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { publishGameUpdate } = await import('./realtime')
    await expect(publishGameUpdate('ABCD', 1)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to publish update'),
      expect.any(Error)
    )
  })

  it('gameChannelName builds the game:{joinCode} convention', async () => {
    const { gameChannelName } = await import('./realtime')
    expect(gameChannelName('WXYZ')).toBe('game:WXYZ')
  })
})
