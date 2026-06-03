# Requirements — Liar's Bar

## v1 Requirements

### Session Management

- [ ] **SESS-01**: User can enter a name and create a new game session as host
- [ ] **SESS-02**: User can enter a name and join an existing active game session
- [ ] **SESS-03**: User can see all joined players in a lobby waiting room before game starts
- [ ] **SESS-04**: Host can start the game once at least 2 players have joined
- [ ] **SESS-05**: Player name persists in localStorage and auto-fills on page revisit

### Game Setup

- [ ] **SETUP-01**: System deals 5 cards per player from a shuffled 20-card deck (6A, 6K, 6Q, 2 Jokers)
- [ ] **SETUP-02**: System randomly assigns a Table Card (Ace, King, or Queen) at round start
- [ ] **SETUP-03**: Each player can only see their own hand; other players see only card counts

### Turn Loop

- [ ] **TURN-01**: Active player can select 1–3 cards from their hand and play them face-down to the center pile
- [ ] **TURN-02**: Card count is implicit from selection (no separate declare step)
- [ ] **TURN-03**: All players see the claim update ("Player X played 2 Kings") after a play
- [ ] **TURN-04**: Next player in turn order receives "Believe" or "Liar!" prompt immediately after active player plays

### Challenge Resolution

- [ ] **CHAL-01**: Only the next player in turn order can call "Liar!" or "Believe"
- [ ] **CHAL-02**: On "Liar!" — played cards are revealed to all players
- [ ] **CHAL-03**: Jokers count as valid Table Cards in all challenge resolutions
- [ ] **CHAL-04**: Challenger loses if all played cards match the Table Card or are Jokers
- [ ] **CHAL-05**: Active player loses if any played card does not match the Table Card and is not a Joker
- [ ] **CHAL-06**: On "Believe" — next player plays their own cards and turn passes to the player after them

### Russian Roulette

- [ ] **ROUL-01**: Challenge loser sees a roulette trigger button; no auto-fire
- [ ] **ROUL-02**: On trigger tap, result is revealed to all players (safe or eliminated)
- [ ] **ROUL-03**: Each roulette pull has independent 1-in-6 elimination chance
- [ ] **ROUL-04**: Eliminated player remains visible on all screens, grayed out with skull indicator

### Round Management

- [ ] **RNDM-01**: After every roulette pull (safe or eliminated), round resets: reshuffle all 20 cards, new Table Card, redeal 5 cards per surviving player
- [ ] **RNDM-02**: Player who successfully plays all 5 cards is marked safe and skipped for the rest of that round
- [ ] **RNDM-03**: Game ends and winner is declared when only one player remains alive
- [ ] **RNDM-04**: Inactive player (no response within timeout) is auto-skipped or removed to prevent game blocking

### UX & Polling

- [ ] **UX-01**: All player screens show whose turn it is via a clear turn indicator
- [ ] **UX-02**: Eliminated players see a read-only table view (cannot interact)
- [ ] **UX-03**: Claim history shows the last N plays in the center pile area
- [ ] **UX-04**: Game state syncs across all player screens via polling (2-second interval)
- [ ] **UX-05**: Portrait mobile layout, playful visual style

---

## v2 Requirements (Deferred)

- Roulette animation / suspense effect — simple reveal in v1, drama in v2
- Sound effects — Web Audio API, opt-in
- Spectator mode — watch without playing
- Game history / stats — win rate, bluff success
- Multiple concurrent game sessions — one at a time in v1
- Avatar selection — names only in v1
- Screen wake lock — documented limitation in v1

---

## Out of Scope

- WebSocket / real-time push — polling is sufficient for turn-based pace; Vercel serverless doesn't support persistent connections
- Room codes / multi-session — one active game at a time keeps state trivial
- Chat / reactions — not part of core game experience
- Avatars — names only
- Account system / auth — no persistent identity beyond session name

---

## Traceability

_(Filled by roadmap agent)_

| REQ-ID | Phase |
|--------|-------|
| SESS-01–05 | — |
| SETUP-01–03 | — |
| TURN-01–04 | — |
| CHAL-01–06 | — |
| ROUL-01–04 | — |
| RNDM-01–04 | — |
| UX-01–05 | — |
