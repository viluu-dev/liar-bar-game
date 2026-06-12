# Requirements Document

## Introduction

Liar's Bar is a browser-based multiplayer bluffing card game where 2-6 players join from their own devices to play a high-stakes game. The core experience revolves around the tension of calling "Liar!" and the Russian Roulette consequence that follows. Players take turns playing cards face-down while claiming they are a specific type, and other players must decide whether to believe them or challenge with potentially lethal consequences.

The game uses a specialized 20-card deck (6 Aces, 6 Kings, 6 Queens, 2 Jokers) and features a Table Card system where all plays must be declared as the current round's designated card type. The emotional climax is the roulette moment - when a player loses a challenge, they must pull a virtual trigger with a 1-in-6 chance of elimination.

## Requirements

### Requirement 1: Session Management

**User Story:** As a player, I want to easily create or join a game session so that I can play with my friends who are physically present.

#### Acceptance Criteria

1. WHEN a user opens the app THEN the system SHALL display a landing page with name entry and options to create or join a game
2. WHEN a user enters a valid name (1+ characters) and clicks "Create Game" THEN the system SHALL create a new game session and make them the host
3. WHEN a user enters a valid name and clicks "Join Game" THEN the system SHALL add them to an existing active game session
4. WHEN a user has previously entered a name THEN the system SHALL auto-fill their name from localStorage on subsequent visits
5. WHEN there is no active game session and a user tries to join THEN the system SHALL display an appropriate error message

### Requirement 2: Lobby Management

**User Story:** As a host, I want to see who has joined and control when the game starts so that I can ensure everyone is ready before beginning.

#### Acceptance Criteria

1. WHEN players join a game session THEN all players SHALL see a live-updating lobby with all joined player names
2. WHEN fewer than 2 players are in the lobby THEN the host SHALL see a disabled "Start Game" button with explanatory text
3. WHEN 2 or more players are in the lobby THEN the host SHALL see an enabled "Start Game" button
4. WHEN more than 6 players attempt to join THEN the system SHALL reject the join attempt with an error message
5. WHEN the lobby updates THEN all player screens SHALL refresh within 2 seconds via polling

### Requirement 3: Game Setup and Card Dealing

**User Story:** As a player, I want the game to properly deal cards and set up each round so that gameplay follows the official rules.

#### Acceptance Criteria

1. WHEN the host starts a game THEN the system SHALL shuffle a 20-card deck (6 Aces, 6 Kings, 6 Queens, 2 Jokers) and deal 5 cards to each player
2. WHEN a round begins THEN the system SHALL randomly select and display a Table Card (Ace, King, or Queen) that is the same for all players
3. WHEN cards are dealt THEN each player SHALL only see their own 5-card hand
4. WHEN viewing other players THEN each player SHALL see only the card count (not the actual cards) for opponents
5. WHEN the game starts THEN all players' screens SHALL transition from lobby to game view within 2 poll cycles

### Requirement 4: Core Turn-Based Gameplay

**User Story:** As the active player, I want to select and play 1-3 cards while declaring them as the Table Card so that I can advance my strategy.

#### Acceptance Criteria

1. WHEN it is a player's turn THEN they SHALL see their hand with tap-to-select functionality for 1-3 cards
2. WHEN a player taps a selected card THEN it SHALL deselect (toggle behavior)
3. WHEN a player has selected 1-3 cards THEN the "Play" button SHALL become enabled
4. WHEN a player taps "Play" THEN the selected cards SHALL be removed from their hand and added face-down to the center pile
5. WHEN cards are played THEN all players SHALL see an updated claim message ("Player X played 2 Kings") within 2 seconds
6. WHEN the "Play" button is tapped THEN it SHALL immediately disable to prevent double-submission

### Requirement 5: Challenge Resolution System

**User Story:** As the next player in turn, I want to decide whether to believe the previous player's claim or call them a liar so that I can challenge suspicious plays.

#### Acceptance Criteria

1. WHEN the active player completes their turn THEN only the next player in turn order SHALL see "Believe" and "Liar!" buttons
2. WHEN a player clicks "Believe" THEN play SHALL advance to them and they SHALL see their own turn interface
3. WHEN a player clicks "Liar!" THEN the previously played cards SHALL flip face-up and be visible to all players
4. WHEN cards are revealed after a "Liar!" call THEN Jokers SHALL count as valid Table Cards
5. WHEN all revealed cards match the Table Card or are Jokers THEN the challenger SHALL lose
6. WHEN any revealed card does not match the Table Card and is not a Joker THEN the active player SHALL lose

### Requirement 6: Russian Roulette Mechanics

**User Story:** As a challenge loser, I want to face the roulette consequence so that the game maintains its high-stakes tension.

#### Acceptance Criteria

1. WHEN a player loses a challenge THEN only they SHALL see an active roulette trigger button
2. WHEN the roulette trigger is displayed THEN it SHALL never fire automatically - the loser must tap it
3. WHEN the roulette trigger is tapped THEN there SHALL be a 1-in-6 chance of elimination (random, independent each time)
4. WHEN the roulette result occurs THEN all players SHALL see the outcome (SAFE or ELIMINATED) within 2 poll cycles
5. WHEN a player is eliminated THEN they SHALL appear grayed out with a skull indicator on all screens
6. WHEN a player is eliminated THEN they SHALL see a read-only view of the game with no interactive controls

### Requirement 7: Round Management and Game Flow

**User Story:** As a player, I want rounds to automatically reset after each roulette pull so that gameplay continues smoothly toward a winner.

#### Acceptance Criteria

1. WHEN any roulette pull occurs (safe or eliminated) THEN the system SHALL automatically reshuffle all 20 cards
2. WHEN a round resets THEN the system SHALL randomly assign a new Table Card and deal 5 cards to each surviving player
3. WHEN a player successfully plays all 5 cards from their hand without losing a challenge THEN they SHALL be marked as safe and skipped for the remainder of that round
4. WHEN only one player remains alive THEN the system SHALL display a game-over screen declaring them the winner
5. WHEN the game ends THEN all players SHALL see the winner announcement and have the option to start a new game

### Requirement 8: User Experience and Interface

**User Story:** As a player, I want a clear, mobile-friendly interface so that I can easily play on my phone while with friends.

#### Acceptance Criteria

1. WHEN viewing the game on any screen THEN there SHALL be a clear indicator showing whose turn it is
2. WHEN it is not a player's turn THEN action buttons SHALL be hidden (not just disabled) to prevent confusion
3. WHEN using the game on mobile THEN the layout SHALL be optimized for portrait orientation and readable at 375px width
4. WHEN game state changes occur THEN all player screens SHALL sync via 2-second polling intervals
5. WHEN a player is inactive for more than 90 seconds during their turn THEN their turn SHALL be automatically skipped

### Requirement 9: Connection Resilience

**User Story:** As a player, I want the game to handle connection issues gracefully so that temporary network problems don't ruin the game session.

#### Acceptance Criteria

1. WHEN a player's connection fails for 3+ consecutive poll attempts THEN they SHALL see a "Reconnecting..." banner
2. WHEN polling resumes after connection issues THEN the "Reconnecting..." banner SHALL disappear and the player SHALL rejoin the current game state
3. WHEN a game session has no activity for 4+ hours THEN it SHALL automatically expire to prevent orphaned sessions
4. WHEN connection issues occur THEN the game state SHALL remain consistent and other players SHALL continue to see live updates

### Requirement 10: Game History and Claims Display

**User Story:** As a player making challenge decisions, I want to see recent play history so that I can make informed decisions about whether someone is lying.

#### Acceptance Criteria

1. WHEN viewing the center pile area THEN players SHALL see a history log of the last 3-5 plays
2. WHEN a new claim is made THEN it SHALL appear in the history log visible to all players
3. WHEN making a challenge decision THEN the claim history SHALL provide context about recent plays and patterns
4. WHEN the round resets THEN the claim history SHALL clear to start fresh for the new round