# Implementation Plan

## Phase 1: Foundation - Redis Data Layer and Core Types

- [x] 1. Set up project structure and dependencies
  - Initialize Next.js 15 project with TypeScript, Tailwind CSS, and App Router
  - Install core dependencies: @upstash/redis, swr, zod, framer-motion
  - Configure environment variables for Upstash Redis connection
  - Set up basic project structure with app/, lib/, and components/ directories
  - _Requirements: Foundation for all subsequent requirements_

- [x] 2. Create core TypeScript types and interfaces
  - Define Card, TableCard, GameStatus enums and Player interface
  - Implement complete GameState interface with all game phases
  - Create ProjectedGameState interface for client-safe data
  - Write LastPlay and other supporting type definitions
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 4.1_

- [x] 3. Implement Zod validation schemas
  - Create CardSchema, TableCardSchema, GameStatusSchema enums
  - Build PlayerSchema with validation rules for names, IDs, and state
  - Implement complete GameStateSchema with nested validation
  - Create API input validation schemas for all endpoints
  - _Requirements: 1.1, 1.2, 8.1, 9.1_

- [x] 4. Build Redis client and state management utilities
  - Set up Upstash Redis client with environment configuration
  - Implement withGameLock() function using SET NX EX pattern
  - Create getGameState() with Zod validation and error handling
  - Build setGameState() with TTL management and JSON serialization
  - _Requirements: 9.3, 9.1, 9.2_

- [x] 5. Implement game state projection for security
  - Create projectGameView() function to strip private data
  - Ensure deck and pile fields are never exposed to clients
  - Replace opponent hand arrays with handCount numbers
  - Validate that own hand is correctly exposed to requesting player
  - _Requirements: 3.2, 5.1, 6.2, 8.1_

## Phase 2: Session Management and Lobby System

- [ ] 6. Create landing page and name entry form
  - Build responsive mobile-first landing page with Tailwind
  - Implement name input form with localStorage persistence
  - Add Create Game and Join Game buttons with validation
  - Handle form submission and navigation to appropriate screens
  - _Requirements: 1.1, 1.2, 1.5, 8.3_

- [x] 7. Implement game creation API endpoint
  - Build POST /api/game/create route handler
  - Generate player ID, initialize GameState in lobby phase
  - Set creator as host with proper permissions
  - Return playerId and initial game version to client
  - _Requirements: 1.1, 2.2, 2.3_

- [ ] 8. Build game join API endpoint
  - Create POST /api/game/join route handler
  - Validate game exists and is in lobby phase
  - Enforce 6-player maximum limit with error handling
  - Add player to existing game state with proper indexing
  - _Requirements: 1.2, 2.1, 2.4_

- [x] 9. Create game state polling endpoint
  - Implement GET /api/game/state with playerId parameter
  - Add version-based change detection for efficient polling
  - Use projectGameView() to ensure data security
  - Handle non-existent game states gracefully
  - _Requirements: 2.5, 8.4, 9.1, 9.2_

- [ ] 10. Build lobby screen with live player list
  - Create lobby component with real-time player display
  - Implement SWR polling with 2-second refresh interval
  - Show host-only Start Game button with 2+ player validation
  - Display waiting state and player count information
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 8.4_

## Phase 3: Game Setup and Card Display

- [x] 11. Implement card dealing and deck management
  - Create shuffleDeck() function using Fisher-Yates algorithm
  - Build dealCards() function to distribute 5 cards per player
  - Generate initial 20-card deck (6A, 6K, 6Q, 2J) correctly
  - Implement Table Card random selection (A, K, or Q only)
  - _Requirements: 3.1, 3.3_

- [ ] 12. Build game start API endpoint
  - Create POST /api/game/start route handler for host only
  - Transition from lobby to playing phase with validation
  - Deal initial hands and set table card for the round
  - Initialize turn order and current player index
  - _Requirements: 2.3, 3.1, 3.2_

- [ ] 13. Create game screen layout and UI components
  - Build responsive game screen with mobile-first design
  - Display table card prominently at top of screen
  - Show all players with names, card counts, and alive status
  - Create card hand display for bottom of screen
  - _Requirements: 3.2, 3.3, 8.3_

- [ ] 14. Implement private hand display and opponent card counts
  - Render player's own 5-card hand with card graphics
  - Display other players with card count only (no card values)
  - Ensure security through proper use of ProjectedGameState
  - Add visual indicators for eliminated and safe players
  - _Requirements: 3.2, 3.3, 6.3_

## Phase 4: Core Turn-Based Gameplay Loop

- [ ] 15. Build card selection interaction system
  - Implement tap-to-select card functionality with visual feedback
  - Add toggle behavior (tap again to deselect)
  - Enforce 1-3 card selection limits with UI validation
  - Enable Play button only when valid selection is made
  - _Requirements: 4.1, 4.2, 4.6, 8.1_

- [ ] 16. Create play cards API endpoint
  - Build POST /api/game/play route handler
  - Validate turn ownership and card indices
  - Remove selected cards from player's hand and add to pile
  - Record claim (count + declared card type) in game state
  - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [ ] 17. Implement turn advancement and game flow
  - Advance currentPlayerIndex to next alive, non-safe player
  - Set challengerIndex for the next player decision
  - Update lastPlay with player name and claim details
  - Increment version and trigger polling updates across clients
  - _Requirements: 4.3, 4.4, 4.5, 8.1_

- [ ] 18. Add turn indicator and game state display
  - Show clear "Your Turn" indicator for active player
  - Display whose turn it is for all other players
  - Show recent claim ("Player X played 2 Kings") to all clients
  - Hide action buttons when not player's turn
  - _Requirements: 8.1, 10.2_

- [ ] 19. Implement double-tap prevention and action feedback
  - Disable Play button immediately on first tap
  - Add loading states and visual feedback during API calls
  - Show success/error messages for completed actions
  - Prevent rapid successive actions that could cause conflicts
  - _Requirements: 4.6, 8.1_

## Phase 5: Challenge Resolution System

- [ ] 20. Create challenge decision interface
  - Show "Believe" and "Liar!" buttons to challenger only
  - Display waiting state for all other players during challenge
  - Ensure only the correct next-in-turn player can challenge
  - Add visual emphasis to make challenge decision unmissable
  - _Requirements: 5.1, 5.4_

- [ ] 21. Implement challenge API endpoint and validation
  - Build POST /api/game/challenge route handler
  - Validate challenger is the correct next player in turn
  - Handle both "believe" and "liar" challenge actions
  - Update game phase and state based on challenge decision
  - _Requirements: 5.1, 5.2, 5.4_

- [ ] 22. Build card reveal and Joker validation logic
  - Implement resolveChallenge() function for "liar" calls
  - Check if all pile cards match Table Card or are Jokers
  - Handle Jokers as wildcards that count as valid Table Cards
  - Determine challenge winner/loser based on card validation
  - _Requirements: 5.2, 5.3, 5.5, 5.6_

- [ ] 23. Create challenge resolution display
  - Show face-up card reveal to all players during "liar" resolution
  - Display challenge outcome (who won/lost) clearly
  - Highlight Jokers as valid wildcards in the revealed cards
  - Transition game phase to roulette for the challenge loser
  - _Requirements: 5.2, 5.3, 5.5_

- [ ] 24. Handle "believe" action and continued gameplay
  - Continue normal turn flow when challenger chooses "believe"
  - Advance turn to challenger for their card play
  - Maintain pile state and claim history
  - Ensure no card reveal occurs on "believe" actions
  - _Requirements: 5.4_

## Phase 6: Russian Roulette and Round Management

- [ ] 25. Create roulette trigger interface
  - Display roulette button only to challenge loser
  - Never auto-fire - require explicit player tap
  - Add visual tension and emphasis to roulette moment
  - Show waiting state to all other players during roulette
  - _Requirements: 6.1, 6.2_

- [ ] 26. Implement roulette API endpoint with randomization
  - Build POST /api/game/roulette route handler
  - Generate truly random 1-in-6 elimination chance
  - Validate only the challenge loser can trigger roulette
  - Return result (safe/eliminated) to update game state
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 27. Build elimination and survival result display
  - Show roulette result to all players within 2 poll cycles
  - Add skull indicator and gray out eliminated players
  - Display survival message for safe players
  - Update player alive status across all client screens
  - _Requirements: 6.2, 6.3, 6.4_

- [ ] 28. Implement automatic round reset system
  - Trigger round reset after every roulette pull
  - Reshuffle all 20 cards and select new Table Card
  - Deal 5 new cards to each surviving player
  - Clear pile, claims, and reset turn order
  - _Requirements: 7.1, 7.2, 7.4_

- [ ] 29. Add safe player mechanics
  - Mark players as safe when they empty their hand
  - Skip safe players during turn advancement
  - Include safe players in round reset with new cards
  - Display safe status clearly in player list
  - _Requirements: 7.3_

- [ ] 30. Implement win condition and game over screen
  - Detect when only one player remains alive
  - Transition to finished game phase
  - Display winner announcement to all players
  - Add "Play Again" option to start new game
  - _Requirements: 7.4_

## Phase 7: Connection Resilience and Inactive Players

- [ ] 31. Add inactive player detection and auto-skip
  - Track lastSeenAt timestamp on each poll and action
  - Detect players inactive for 90+ seconds during their turn
  - Automatically skip inactive player's turn
  - Continue game flow without manual intervention
  - _Requirements: 9.1_

- [ ] 32. Implement reconnection handling and status display
  - Show "Reconnecting..." banner after 3 failed polls
  - Hide banner when polling resumes successfully
  - Maintain game state consistency during disconnections
  - Allow players to rejoin current game state seamlessly
  - _Requirements: 9.2_

## Phase 8: User Experience Polish and Game History

- [ ] 33. Create claim history display system
  - Show last 3-5 plays in center pile area
  - Update history log with each new claim
  - Provide context for challenge decision making
  - Clear history at start of each new round
  - _Requirements: 10.1_

- [ ] 34. Polish mobile interface and visual feedback
  - Ensure all buttons have adequate touch targets (44px+)
  - Add card lift effects and tap feedback animations
  - Optimize layout for 375px width mobile screens
  - Hide (not disable) unavailable actions to prevent confusion
  - _Requirements: 8.3, 10.2_

- [ ] 35. Add game session management and cleanup
  - Implement 4-hour TTL on game sessions
  - Handle session expiration gracefully
  - Allow creation of new games after previous completion
  - Clean up orphaned game states automatically
  - _Requirements: 9.3_