import { NextRequest, NextResponse } from 'next/server'
import { AblyTokenRequestSchema } from '@/lib/schemas'
import { getGameState } from '@/lib/redis'
import { getAblyRestClient, gameChannelName } from '@/lib/realtime'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parseResult = AblyTokenRequestSchema.safeParse({
      playerId: searchParams.get('playerId'),
      joinCode: searchParams.get('joinCode'),
    })

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: playerId and joinCode are required' },
        { status: 400 }
      )
    }

    const { playerId, joinCode } = parseResult.data

    const client = getAblyRestClient()
    if (!client) {
      return NextResponse.json(
        { error: 'Realtime push is not configured' },
        { status: 503 }
      )
    }

    const gameState = await getGameState(joinCode)
    const playerExists = gameState?.players.some(player => player.id === playerId) ?? false
    if (!playerExists) {
      return NextResponse.json(
        { error: 'Player not found in current game session' },
        { status: 404 }
      )
    }

    const tokenRequest = await client.auth.createTokenRequest({
      clientId: playerId,
      capability: { [gameChannelName(joinCode)]: ['subscribe'] },
    })

    return NextResponse.json(tokenRequest)
  } catch (error) {
    console.error('Ably token issuance error:', error)

    return NextResponse.json(
      { error: 'Failed to issue realtime token' },
      { status: 500 }
    )
  }
}
