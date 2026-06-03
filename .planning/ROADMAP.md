# Roadmap: Liar's Bar

## Overview

Eight phases build the game from Redis infrastructure through a complete, playable bluffing card game with Russian Roulette. The foundation phase establishes the correctness guarantees (lock, projection, types) that everything else rests on. Subsequent phases each deliver a complete end-to-end slice — lobby works before game logic exists, game screen displays before cards can be played, the happy-path turn loop is solid before challenge complexity is added, and the emotional climax (roulette) is polished before edge-case robustness work begins. Fine granularity lets natural delivery boundaries stand rather than artificially compressing phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Redis layer, GameState types, lock wrapper, and player-view projection
- [ ] **Phase 2: Lobby** - Create/join game session, live player list, polling loop end-to-end
- [ ] **Phase 3: Game Start + Display** - Deal cards, assign Table Card, render game screen with private hands
- [ ] **Phase 4: Core Turn Loop** - Active player selects and plays cards; all screens update via polling
- [ ] **Phase 5: Challenge Flow** - Liar!/Believe prompt, card reveal, Joker wildcard, loser determination
- [ ] **Phase 6: Roulette + Round Reset** - Trigger tap, elimination reveal, round reshuffle, winner detection
- [ ] **Phase 7: Inactive Player Handling** - Auto-skip ghost turns, reconnect banner, connection resilience
- [ ] **Phase 8: UX Polish** - Claim history log, mobile layout refinement, turn indicator, eliminated view

## Phase Details

### Phase 1: Foundation
**Goal**: The Redis data layer is correct, secure, and hardened — GameState types, Zod schema, distributed lock, and per-player view projection are in place before any route handler is written
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: (none — pure infrastructure; correctness here prevents unrecoverable bugs in all later phases)
**Success Criteria** (what must be TRUE):
  1. A scratch script can write a full GameState blob to Upstash Redis and read it back with the correct TypeScript type
  2. `withGameLock()` prevents a simulated concurrent write from corrupting game state (second writer waits or errors)
  3. `projectGameView(state, playerId)` strips opponents' hands and the server-side deck — a caller cannot receive another player's cards
  4. Zod schema rejects a malformed payload (e.g. wrong card count, invalid status) at the API boundary
**Plans**: TBD

### Phase 2: Lobby
**Goal**: Players can enter their name, create or join a game session, and watch the player list update live — the full tech stack works end-to-end before any game logic exists
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, UX-04
**Success Criteria** (what must be TRUE):
  1. User opens the landing page, types a name, and taps "Create Game" — they land on the lobby screen as host with their name listed
  2. A second player on a different device (or tab) enters their name, taps "Join Game", and appears on both players' lobby screens within 2 seconds
  3. The host sees a "Start Game" button that becomes active once at least 2 players have joined; it remains disabled with fewer than 2
  4. A player's name auto-fills from localStorage on a subsequent page visit without re-typing
  5. The lobby player list refreshes via polling — no manual refresh needed
**Plans**: TBD
**UI hint**: yes

### Phase 3: Game Start + Display
**Goal**: The host can start the game and every player sees their private 5-card hand, the Table Card, and the full player list with card counts — display is correct before any interaction is possible
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SETUP-01, SETUP-02, SETUP-03, UX-05
**Success Criteria** (what must be TRUE):
  1. Host taps "Start Game" and all players' screens transition from lobby to the game screen within 2 poll cycles
  2. Each player sees exactly 5 cards in their own hand; opponents show only a card count (not card values)
  3. The Table Card (Ace, King, or Queen) is displayed prominently and is the same value on every player's screen
  4. The game screen fits a mobile portrait viewport without horizontal scroll; the layout is readable at 375 px width
**Plans**: TBD
**UI hint**: yes

### Phase 4: Core Turn Loop
**Goal**: The active player can select 1–3 cards, play them face-down, and all other screens update with the claim within 2 seconds — the happy-path turn cycle works across real devices
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: TURN-01, TURN-02, TURN-03, TURN-04, UX-01
**Success Criteria** (what must be TRUE):
  1. The active player's screen shows their hand with tap-to-select; tapping a selected card deselects it; only 1–3 cards can be selected before the Play button activates
  2. Tapping Play removes the selected cards from the active player's hand and shows a claim ("Player X played 2 Kings") on all screens within 2 seconds
  3. A clear turn indicator shows whose turn it is on every player's screen at all times
  4. The next player's screen shows the "Believe" or "Liar!" prompt immediately after the active player's play propagates
  5. The Play button is disabled immediately on first tap and cannot be triggered twice from a double-tap
**Plans**: TBD
**UI hint**: yes

### Phase 5: Challenge Flow
**Goal**: The challenge path is fully resolved — a player can call "Liar!" or "Believe", cards are revealed with the correct winner/loser logic, and Joker wildcards are handled correctly in all edge cases
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: CHAL-01, CHAL-02, CHAL-03, CHAL-04, CHAL-05, CHAL-06
**Success Criteria** (what must be TRUE):
  1. Only the correct next-in-turn player sees the "Believe" / "Liar!" prompt; other players see a waiting state
  2. On "Liar!" — the played cards flip face-up and are visible to all players; a Joker in the pile counts as valid and does not trigger a loss for the active player
  3. The loser is correctly identified: challenger loses if all cards were valid (Table Card or Joker); active player loses if any card was neither
  4. On "Believe" — the next player's turn begins with their own "Believe"/"Liar!" prompt; no card reveal occurs
  5. The game transitions to the roulette phase for the identified loser immediately after challenge resolution
**Plans**: TBD
**UI hint**: yes

### Phase 6: Roulette + Round Reset
**Goal**: The game's emotional core is complete — the loser taps the roulette trigger, elimination or safety is revealed to all players, the round resets automatically, and the last-player-alive win condition ends the game
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: ROUL-01, ROUL-02, ROUL-03, ROUL-04, RNDM-01, RNDM-02, RNDM-03, UX-02
**Success Criteria** (what must be TRUE):
  1. Only the challenge loser sees an active roulette trigger button; the button never fires automatically — the loser must tap it
  2. After the tap, the result (SAFE or ELIMINATED) is visible to all players within 2 poll cycles; an eliminated player's name is grayed out with a skull indicator on every screen
  3. Eliminated players can see the table in read-only mode and cannot interact with game controls
  4. After every roulette pull (safe or eliminated), all 20 cards are reshuffled, a new Table Card is randomly assigned, and each surviving player receives 5 new cards
  5. A player who plays all 5 cards from their hand without losing a challenge is marked safe and skipped for the rest of that round
  6. When only one player remains alive, a game-over screen declares the winner
**Plans**: TBD
**UI hint**: yes

### Phase 7: Inactive Player Handling
**Goal**: The game cannot be permanently blocked by a ghost player — an inactive player is detected and auto-skipped, and connection problems surface clearly rather than silently stalling the session
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: RNDM-04
**Success Criteria** (what must be TRUE):
  1. If the active player has not responded within the inactivity timeout, their turn is automatically skipped and play passes to the next player — the game continues without manual intervention
  2. A player whose polling fails 3 consecutive times sees a "Reconnecting..." banner; once polling resumes, the banner disappears and the player is back in the game
**Plans**: TBD

### Phase 8: UX Polish
**Goal**: The game is pleasant to use — claim history gives players context for challenge decisions, the turn indicator is unmissable, and the mobile layout is fully refined
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: UX-03
**Success Criteria** (what must be TRUE):
  1. The center pile area shows the last 3–5 plays as a claim history log, giving the next player context when deciding whether to call "Liar!"
  2. Action buttons are hidden (not just disabled) when it is not the player's turn — no tappable elements that silently do nothing
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Lobby | 0/? | Not started | - |
| 3. Game Start + Display | 0/? | Not started | - |
| 4. Core Turn Loop | 0/? | Not started | - |
| 5. Challenge Flow | 0/? | Not started | - |
| 6. Roulette + Round Reset | 0/? | Not started | - |
| 7. Inactive Player Handling | 0/? | Not started | - |
| 8. UX Polish | 0/? | Not started | - |
