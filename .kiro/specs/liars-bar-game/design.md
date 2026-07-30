# Design Document

## Overview

Liar's Bar is a browser-based multiplayer bluffing card game built as a stateless Next.js application with real-time synchronization via polling. The system architecture consists of three tiers: browser clients polling for game state, Next.js Route Handlers processing game actions as serverless functions, and Upstash Redis storing the complete game state as a single JSON document.

The core design principle is that everything serves the emotional climax - the tension of calling "Liar!" and the subsequent Russian Roulette consequence. The system maintains one active game session at a time to simplify state management, uses polling rather than WebSockets due to Vercel platform constraints, and employs a mobile-first portrait layout optimized for players on their phones in the same physical space.

## Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Browser Client │    │  Browser Client │    │  Browser Client │
│   (Player A)    │    │   (Player B)    │    │   (Player C)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ GET /api/game/state   │                       │
         │ POST /api/game/action │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                ┌─────────────────▼─────────────────┐
                │      Next.js Route Handlers      │
                │     (Vercel Serverless)          │
                │   - Stateless functions          │
                │   - 10s timeout limit            │
                │   - Distributed lock pattern     │
                └─────────────────┬─────────────────┘
                                 │
                ┌─────────────────▼─────────────────┐
                │      Upstash Redis               │
                │   - Single key: game:state       │
                │   - 4-hour TTL                   │
                │   - HTTP-based (not TCP)         │
                │   - 500K commands/month free     │
                └─────────────────────────────────────┘
```

### Technology Stack

- **Frontend & API**: Next.js 15 (App Router) with TypeScript
- **State Storage**: Upstash Redis via `@upstash/redis` 
- **Polling**: SWR with 2-second `refreshInterval`
- **Validation**: Zod for API input validation and state schemas
- **Animations**: Motion (formerly Framer Motion) for card interactions
- **Styling**: Tailwind CSS 4.x for mobile-first responsive design

### Key Architectural Decisions

1. **Single Game Session**: One active game at key `game:state` simplifies routing and state management
2. **Polling over WebSockets**: Vercel serverless doesn't support persistent connections; 2-second polling is sufficient for turn-based gameplay
3. **JSON Blob State**: Entire game state stored as one Redis key for atomic read/write operations
4. **Distributed Locking**: `SET NX EX 5` pattern prevents concurrent write corruption
5. **Per-Player Projections**: Server strips private data before sending state to clients

## Components and Interfaces

### Core Data Models

#### GameState (Server-Side Complete State)
```typescript
type Card = 'ACE' | 'KING' | 'QUEEN' | 'JOKER'
type TableCard = 'ACE' | 'KING' | 'QUEEN'
type GameStatus = 'lobby' | 'playing' | 'challenge' | 'roulette' | 'finished'

interface Player {
  id: string              // UUID, stable across reconnects
  name: string            
  hand: Card[]            // Private - only visible to owner
  isAlive: boolean        
  isSafe: boolean         // Emptied hand this round
  isHost: boolean         
  joinedAt: number        // Unix timestamp
  lastSeenAt: number      // Updated on each poll/action
}

interface LastPlay {
  playerId: string
  playerName: string
  cards: Card[]           // Server-only, revealed during challenges
  claimedCount: number    // How many cards claimed
  claimedCard: TableCard  // What they claimed to play
}

interface GameState {
  status: GameStatus
  players: Player[]
  deck: Card[]                    // Server-only, never exposed
  tableCard: TableCard | null
  pile: Card[]                    // Server-only, never exposed  
  pileCount: number               // Computed from pile.length
  currentPlayerIndex: number      // Index into players[]
  challengerIndex: number | null  // Who must challenge next
  lastPlay: LastPlay | null
  roulettePlayerId: string | null // Challenge loser
  roundNumber: number
  winnerId: string | null
  version: number                 // Monotonically increasing
  createdAt: number
  updatedAt: number
}
```

#### ProjectedGameState (Client-Safe View)
```typescript
interface ProjectedPlayer {
  id: string
  name: string
  handCount: number       // Length of hand, not actual cards
  isAlive: boolean
  isSafe: boolean
  isHost: boolean
  joinedAt: number
  lastSeenAt: number
}

interface ProjectedGameState {
  status: GameStatus
  players: ProjectedPlayer[]
  myHand: Card[]          // Only for requesting player
  tableCard: TableCard | null
  pileCount: number
  currentPlayerIndex: number
  challengerIndex: number | null
  lastPlay: {             // Cards omitted until challenge reveal
    playerId: string
    playerName: string
    claimedCount: number
    claimedCard: TableCard
  } | null
  roulettePlayerId: string | null
  roundNumber: number
  winnerId: string | null
  version: number
}
```

### API Routes

All endpoints live under `/app/api/game/` following Next.js App Router conventions.

#### GET /api/game/state
**Purpose**: Polling endpoint for game state synchronization
**Query Params**: 
- `playerId`: UUID identifying the requesting player
- `since`: Version number client already has (optional)

**Response**: 
```typescript
// If version unchanged
{ version: number, changed: false }

// If state updated  
{ 
  version: number, 
  changed: true, 
  gameState: ProjectedGameState 
}

// If no game exists
{ phase: "none" }
```

#### POST /api/game/create
**Purpose**: Create new game session
**Body**: `{ playerName: string }`
**Response**: `{ playerId: string, gameVersion: number }`

#### POST /api/game/join  
**Purpose**: Join existing game session
**Body**: `{ playerName: string }`
**Response**: `{ playerId: string }`

#### POST /api/game/start
**Purpose**: Host starts the game (lobby → playing)
**Body**: `{ playerId: string }`
**Response**: `{ success: boolean, gameVersion: number }`

#### POST /api/game/play
**Purpose**: Active player plays 1-3 cards
**Body**: `{ playerId: string, cardIndices: number[], declaredCard: TableCard }`
**Response**: `{ success: boolean, gameVersion: number }`

#### POST /api/game/challenge
**Purpose**: Next player challenges or believes previous play
**Body**: `{ playerId: string, action: "liar" | "believe" }`
**Response**: `{ success: boolean, gameVersion: number }`

#### POST /api/game/roulette
**Purpose**: Challenge loser pulls the trigger
**Body**: `{ playerId: string }`
**Response**: `{ success: boolean, result: "safe" | "eliminated", gameVersion: number }`

### Redis Schema

#### Primary Game State
- **Key**: `game:state`
- **Type**: STRING (JSON serialized GameState)
- **TTL**: 4 hours (14400 seconds)
- **Size**: ~10KB typical, <50KB maximum

#### Distributed Lock
- **Key**: `game:lock` 
- **Type**: STRING (value irrelevant)
- **TTL**: 5 seconds (deadlock prevention)
- **Pattern**: `SET game:lock 1 NX EX 5`

#### Key Naming Rationale
Single game session means simple key structure. No need for room codes or multiple namespaces.

### State Management Functions

#### Core Redis Operations
```typescript
// lib/redis.ts
export async function withGameLock<T>(
  fn: () => Promise<T>
): Promise<T> {
  // Acquire distributed lock, execute function, release lock
}

export async function getGameState(): Promise<GameState | null> {
  // Retrieve and parse game state with Zod validation
}

export async function setGameState(state: GameState): Promise<void> {
  // Serialize and store state with TTL
}

export function projectGameView(
  state: GameState, 
  playerId: string
): ProjectedGameState {
  // Strip private data for client consumption
}
```

#### Game Logic Functions
```typescript  
// lib/game-logic.ts
export function createInitialDeck(): Card[] {
  // Generate 20-card deck: 6A, 6K, 6Q, 2J
}

export function shuffleDeck(deck: Card[]): Card[] {
  // Fisher-Yates shuffle with crypto.randomInt
}

export function dealCards(deck: Card[], playerCount: number): {
  playerHands: Card[][]
  remainingDeck: Card[]
} {
  // Deal 5 cards per player
}

export function validatePlay(
  hand: Card[], 
  cardIndices: number[]
): boolean {
  // Validate 1-3 cards, indices exist in hand
}

export function resolveChallenge(
  pile: Card[], 
  tableCard: TableCard
): { isValid: boolean, invalidCards: Card[] } {
  // Check if all cards match tableCard or are Jokers
}

export function generateRouletteResult(): boolean {
  // 1-in-6 elimination chance
}
```

## Data Models

### Card and Game Types

Cards are represented as string unions for type safety and serialization simplicity:
- `Card = 'ACE' | 'KING' | 'QUEEN' | 'JOKER'`
- `TableCard = 'ACE' | 'KING' | 'QUEEN'` (no Jokers as table cards)

Game phases follow a strict state machine:
- `lobby` → `playing` → `challenge` → `roulette` → `playing` (loop) → `finished`

### Player State Transitions

Players maintain several boolean flags:
- `isAlive`: false when eliminated via roulette
- `isSafe`: true when hand is empty (immune to challenges this round)
- `isHost`: true for game creator (can start game)

### Version-Based Synchronization

Every state mutation increments the `version` field. Clients include their last known version in poll requests. Server returns `{changed: false}` when versions match, reducing unnecessary React re-renders by ~80%.

### Security and Privacy

The `projectGameView()` function enforces the security boundary between server state and client views:

**Always Stripped from Client Responses:**
- `deck` field (complete deck state)  
- `pile` field (actual played cards until challenge reveal)
- Other players' `hand` arrays (replaced with `handCount`)
- `lastPlay.cards` (until challenge resolution)

**Exposed to All Clients:**
- Player names, card counts, alive/safe status
- Current turn index and challenge state
- Table card and pile count
- Game phase and round number

## Error Handling

### Distributed Lock Conflicts

When multiple players attempt simultaneous actions:
1. First player acquires `game:lock` via `SET NX EX 5`
2. Subsequent players receive lock failure
3. Route handler returns `409 Conflict`
4. Client retries after 500ms delay (max 3 attempts)
5. Lock auto-expires after 5 seconds if function crashes

### Validation Failures

All API routes use Zod schemas to validate input:
- Invalid payloads return `400 Bad Request`
- Turn ownership violations return `403 Forbidden`  
- Game state consistency errors return `409 Conflict`

### Network Resilience

SWR handles polling failures gracefully:
- Automatic retry with exponential backoff
- `revalidateOnFocus` catches returning players
- Client shows "Reconnecting..." after 3 consecutive failures
- Game state remains consistent server-side during client disconnects

### Inactive Player Handling

Players who don't poll/act within 90 seconds:
- Automatically skipped during their turn
- Turn advances to next alive player
- Forced discard of one card (simulating timeout penalty)
- No manual intervention required

## Testing Strategy

### Unit Testing Approach

**Game Logic Functions**
- Pure functions tested in isolation
- Focus on edge cases: Joker validation, empty hands, turn advancement
- Property-based testing for shuffle randomness
- Test all challenge resolution scenarios

**State Projection**
- Verify private data never leaks to wrong players
- Test edge cases: eliminated players, empty games
- Validate Zod schema parsing and rejection

**Redis Operations**
- Mock Redis for unit tests
- Integration tests against real Upstash instance
- Lock contention simulation
- TTL expiration verification

### Integration Testing

**API Route Testing**
- Full request/response cycle testing
- Error condition validation (invalid turns, missing players)
- Lock behavior under concurrent requests
- Version consistency across operations

**End-to-End Polling**
- Multi-client state synchronization
- Version-based change detection
- Network failure recovery
- Inactive player timeout behavior

### Performance Testing

**Redis Command Budget**
- Monitor commands/session to validate free tier usage
- Load testing with 8 concurrent players
- Polling frequency optimization
- TTL cleanup verification

**Serverless Cold Starts**
- Function warm-up behavior under polling load
- Response time distribution analysis
- Memory usage optimization

### Security Testing

**Data Isolation**
- Verify players can't access others' hands
- Test projection function against malformed data
- Validate server-side deck state never leaks

**Input Validation**
- Malformed payload rejection
- SQL injection prevention (N/A for Redis)
- Rate limiting evaluation

## Implementation Phases

The design supports incremental development following the existing roadmap:

### Phase 1: Foundation
Core Redis layer, TypeScript types, Zod schemas, lock wrapper, projection functions. All subsequent phases depend on this foundation being correct.

### Phase 2: Lobby System  
Create/join/start flow with polling synchronization. Validates the full tech stack before game logic complexity.

### Phase 3: Game Display
Deal cards, show hands, render game screen. Pure display logic before interactive mechanics.

### Phase 4: Core Gameplay
Card selection and playing. The fundamental turn loop without challenge complexity.

### Phase 5: Challenge Resolution
Liar/Believe logic with card reveal. Most complex business logic in the system.

### Phase 6: Roulette & Rounds
Elimination mechanics and round reset. The emotional core of the game experience.

### Phase 7: Resilience
Inactive player handling and connection recovery. Production reliability features.

### Phase 8: Polish
Mobile UX refinement and visual feedback. User experience optimization.

Each phase delivers a testable, working subset of functionality before the next phase begins.