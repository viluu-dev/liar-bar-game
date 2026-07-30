# Validation Schemas Documentation

This directory contains Zod validation schemas and utilities for the Liar's Bar game. The schemas ensure type safety and data integrity across all API endpoints and game state management.

## Files Overview

- `schemas.ts` - Core Zod validation schemas for all game data structures
- `validation-utils.ts` - Utility functions for request/response validation
- `types.ts` - TypeScript type definitions (existing from previous task)
- `*.test.ts` - Comprehensive test suites

## Core Schemas

### Card Types
- `CardSchema` - Validates 'ACE' | 'KING' | 'QUEEN' | 'JOKER'
- `TableCardSchema` - Validates 'ACE' | 'KING' | 'QUEEN' (no Jokers as table cards)
- `GameStatusSchema` - Validates game phase: 'lobby' | 'playing' | 'challenge' | 'roulette' | 'finished'

### Player Schemas
- `PlayerSchema` - Complete server-side player state with private data (hand cards)
- `ProjectedPlayerSchema` - Client-safe player data (handCount instead of actual cards)

### Game State Schemas
- `GameStateSchema` - Complete server-side game state with all private data
- `ProjectedGameStateSchema` - Client-safe game state with private data stripped

### API Request Schemas
- `CreateGameRequestSchema` - Validates game creation requests
- `JoinGameRequestSchema` - Validates game join requests
- `StartGameRequestSchema` - Validates game start requests
- `PlayCardsRequestSchema` - Validates card play actions
- `ChallengeRequestSchema` - Validates challenge decisions (liar/believe)
- `RouletteRequestSchema` - Validates roulette trigger requests
- `GameStateQuerySchema` - Validates polling query parameters

### API Response Schemas
- `GameStateResponseSchema` - Validates game state polling responses
- `GameCreateResponseSchema` - Validates game creation responses
- `GameJoinResponseSchema` - Validates game join responses
- `GameActionResponseSchema` - Validates standard action responses
- `RouletteResponseSchema` - Validates roulette result responses

## Validation Rules

### Player Names
- Minimum 1 character, maximum 50 characters
- Automatically trimmed of whitespace
- Required field for all player operations

### Card Indices (for play actions)
- Must be integers between 0-4 (valid hand positions)
- Minimum 1 card, maximum 3 cards per play
- Array length enforced by schema

### UUIDs
- All player IDs and game references must be valid UUIDs
- Enforced by `z.string().uuid()`

### Game State Constraints
- Maximum 8 players per game
- Minimum 1 round number
- Non-negative pile counts and hand counts
- Current player index allows -1 (no active player)
- Version numbers monotonically increasing from 0

### Timestamps
- All timestamps must be positive integers (Unix milliseconds)
- `joinedAt`, `lastSeenAt`, `createdAt`, `updatedAt` fields

## Usage Examples

### API Route Validation

```typescript
import { validateCreateGameRequest } from './validation-utils'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validData = validateCreateGameRequest(body)
    
    // validData is now type-safe and validated
    const game = await createGame(validData.playerName)
    return Response.json({ playerId: game.playerId })
    
  } catch (error) {
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify(createValidationErrorResponse(error)),
        { status: 400 }
      )
    }
    throw error
  }
}
```

### Game State Validation

```typescript
import { validateGameState } from './validation-utils'

export async function loadGameFromRedis(key: string): Promise<GameState> {
  const rawData = await redis.get(key)
  const parsedData = JSON.parse(rawData)
  
  // Validate that Redis data matches expected schema
  return validateGameState(parsedData)
}
```

### Middleware-style Validation

```typescript
import { withValidation, CreateGameRequestSchema } from './validation-utils'

const createGameHandler = withValidation(
  CreateGameRequestSchema,
  async (validData) => {
    // Handler receives pre-validated data
    const game = await createGame(validData.playerName)
    return Response.json({ playerId: game.playerId })
  }
)
```

## Error Handling

Validation errors provide detailed information about what went wrong:

```json
{
  "error": "Validation failed",
  "message": "Invalid create game request",
  "issues": [
    {
      "path": "playerName",
      "message": "String must contain at least 1 character(s)",
      "code": "too_small"
    }
  ]
}
```

## Security Features

### Data Projection
The schemas enforce the security boundary between server and client data:

- `GameStateSchema` contains all private data (deck, pile contents, opponent hands)
- `ProjectedGameStateSchema` strips private data and includes only client-safe information
- Hand cards become `handCount` numbers for opponent players
- Own hand is exposed only to the requesting player via `myHand` field

### Input Sanitization
- Player names are automatically trimmed
- Card indices are bounds-checked against valid hand positions  
- All string inputs are validated against expected enums
- Numeric inputs have minimum/maximum constraints

## Testing

The validation schemas have comprehensive test coverage:

- **Basic validation**: Valid and invalid inputs for all schemas
- **Edge cases**: Boundary conditions, empty arrays, null values
- **Security**: Ensures private data can't leak through projections
- **API integration**: Request/response cycle validation
- **Error handling**: Proper error messages and codes

Run tests with:
```bash
npm test
```

All 64+ validation tests must pass before deployment.

## Integration with Requirements

This implementation satisfies the following task requirements:

- ✅ **Create CardSchema, TableCardSchema, GameStatusSchema enums**
- ✅ **Build PlayerSchema with validation rules for names, IDs, and state** 
- ✅ **Implement complete GameStateSchema with nested validation**
- ✅ **Create API input validation schemas for all endpoints**

Referenced requirements:
- **1.1, 1.2**: Player session management validation
- **8.1**: User experience through input validation  
- **9.1**: Connection resilience through robust data validation