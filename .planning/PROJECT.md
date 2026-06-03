# Liar's Bar — Online Multiplayer Card Game

## What This Is

A browser-based multiplayer implementation of the Liar's Bar bluffing card game. Players join from their own devices, enter a name, and play a high-stakes bluffing game where losing means pulling a virtual trigger. One active game session at a time. Mobile-first, portrait layout, playful visual style.

## Core Value

The Russian Roulette moment — the tension of calling "Liar!" and the reveal that follows. Everything else serves that climax.

## Who It's For

Small groups (2–6 players) physically in the same space, each on their own phone or browser tab. Party game energy.

## Context

Greenfield. Hosted on Vercel. No existing codebase. Reference rules: `docs/GAME_PLAY.MD`.

## Game Mechanics

**Deck:** 20 cards — 6 Aces, 6 Kings, 6 Queens, 2 Jokers  
**Deal:** 5 cards per player (2–6 players)  
**Table Card:** Randomly chosen each round — Ace, King, or Queen  
**Turn:** Active player selects 1–3 cards face-down, plays to center pile, declares them as the Table Card  
**Jokers:** Wildcards — always count as the Table Card  
**Challenge:** Next player in turn must either Believe (play their own cards) or call "Liar!"  
**Resolution:** Cards revealed — liar loses if any card isn't Table Card or Joker; challenger loses if all cards were valid  
**Punishment:** Loser clicks roulette — 1-in-6 chance of elimination  
**Round reset:** After each roulette pull, reshuffle all 20 cards, new Table Card  
**Safe:** Player who empties their hand is safe for the rest of that round  
**Win:** Last player alive

## Architecture

| Concern | Decision |
|---------|----------|
| Frontend | Next.js (React) — Vercel-native |
| State storage | Vercel KV (Redis) — survives deploys, free tier |
| Sync | Polling — no WebSocket |
| Sessions | One active game at a time (no room codes) |
| Deployment | Vercel |

## UI Design

**Layout:** Portrait, mobile-first  
**Visual style:** Playful  
**Join flow:** Landing page → enter name → "Create Game" or "Join Game"  
**Lobby:** Players listed, host clicks Start  
**Game screen:**
- Top: Table Card label, center pile card count
- Middle: All players with name, card count, live/dead status
- Bottom: Own hand (private) — tap cards to select, tap Play
- Eliminated players: stay visible, grayed out with skull indicator

**Turn flow:**
1. Active player selects 1–3 cards (count implicit from selection), taps Play
2. Other screens update via polling — show claim ("X played 2 Kings")
3. Next player's screen shows "Believe" or "Liar!" prompt immediately
4. Loser clicks roulette button → instant result reveal to all

**Non-active state:** See full table (pile count, player statuses, whose turn) — read-only

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Player can enter name and join a game session
- [ ] Host can create a game and start when players are ready
- [ ] Game deals 5 cards per player from 20-card deck
- [ ] Table Card randomly assigned each round
- [ ] Active player can select 1–3 cards and play them to the center
- [ ] Next player can challenge (Liar!) or believe and play their own cards
- [ ] Card reveal resolves challenge correctly (Joker = valid)
- [ ] Loser faces roulette with 1-in-6 elimination chance
- [ ] Eliminated players shown as dead, remain visible
- [ ] Player who empties hand is marked safe for the round
- [ ] Round resets (reshuffle + new Table Card) after each roulette pull
- [ ] Last player alive wins — game over screen
- [ ] Polling syncs game state across all player screens
- [ ] Mobile-friendly portrait layout

### Out of Scope

- WebSocket / real-time push — polling is sufficient
- Room codes / multiple concurrent games — one game at a time
- Avatars — names only
- Chat / reactions — not in v1
- Stats / game history — not in v1
- Spectator mode — not in v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vercel KV for state | Serverless functions are stateless; KV survives deploys and is free tier | Pending |
| Polling over WebSocket | Simpler, no persistent connection, sufficient for turn-based pace | Pending |
| One game session at a time | Keeps state management trivial; target use is one friend group | Pending |
| Portrait mobile-first | Players use phones in same room | Pending |
| Next.js | Vercel-native, API routes + frontend in one project | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 after initialization*
