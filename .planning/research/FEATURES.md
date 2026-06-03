# Features Research

**Project:** Liar's Bar — Browser Multiplayer Card Game
**Domain:** Turn-based bluffing party game, co-located players, mobile-first
**Researched:** 2026-06-03
**Overall confidence:** HIGH (game mechanics) / MEDIUM (UX patterns via cross-domain evidence)

---

## Table Stakes (must have)

These are features players assume exist. Absence creates immediate friction or broken-feeling sessions.

### Lobby & Session Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Player name entry on join | Identity minimum; no account needed | Low | Already planned |
| Player list visible to all in lobby | Every lobby game shows who's in | Low | Name + joined status |
| Clear "waiting for host to start" state | Players need to know their join worked | Low | Pending indicator per player |
| Minimum player enforcement (2+) | Can't play alone; start button must block | Low | Disable Start below 2 |
| Host-only Start button | Non-hosts shouldn't trigger game start | Low | Already planned |
| Shareable join signal (URL or room presence indicator) | Players need to know how to get others in | Medium | No room codes per design — "one game at a time" means current URL is the join URL; landing page handles this |

### Game State Visibility (Non-Active Players)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Whose turn it is, clearly shown | Core turn-based contract | Low | Highlight active player name |
| Card counts per player always visible | Lets players strategize; standard in card games | Low | Number badge next to name |
| Table Card (round type) always visible | Core game info; must not require scrolling to find | Low | Persistent header display |
| Center pile card count visible | Players need to track accumulated plays | Low | "Pile: 4 cards" in header |
| Eliminated players remain visible (grayed/skull) | Death is a social moment; disappearing would feel wrong | Low | Already planned |
| "Safe" status visible for hand-emptied players | Game rule requires knowing who is safe | Low | Badge or distinct style |

### Active Player Turn Flow

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Own hand visible only to self | Core card game privacy | Low | Client-side only |
| Tap to select cards, visual selection state | Touch-first interaction; selected cards must look selected | Low | Highlight/lift selected cards |
| Play button disabled until 1-3 cards selected | Prevent invalid plays without needing an error message | Low | Inline validation |
| Claim shown to all after play ("X played 2 Kings") | Other players need to know the declared claim | Low | Feed/log line on all screens |
| "Believe" / "Liar!" prompt on next player's screen | Next player must act; must be unmissable | Low | Full-screen or large CTA |

### Challenge Resolution

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cards flipped/revealed on challenge | The payoff moment; must be visual | Medium | CSS 3D flip animation is well-supported |
| Clear win/lose resolution message | "Challenger wins" / "Player X lied" | Low | Full-table notification |
| Roulette trigger for loser | Core punishment mechanic | Low | Already planned |

### Roulette Moment

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Loser explicitly clicks/taps roulette | Agency over the moment; don't auto-resolve | Low | Button per design |
| Suspense before result | The tension IS the game's core value | Medium | Brief delay (0.5-1.5s) before reveal |
| Clear SAFE vs ELIMINATED outcome | Must be instantly legible | Low | Color/icon + text |
| Outcome visible to all players simultaneously | Social moment; everyone sees it together | Low | Polling delivers to all |

### Round Reset

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Automatic reshuffle + new Table Card after roulette | Game rule; players shouldn't have to request it | Low | Server-side triggered |
| Visual indication that round is resetting | Prevents "is it frozen?" confusion | Low | "Reshuffling..." toast/state |
| New hand dealt to all alive players | Core deal mechanics | Low | Per rules |

### Turn Notification on Mobile

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Screen changes visually when it becomes your turn | Players set phone down between turns | Medium | Polling must trigger UI change within ~2s |
| "Your turn" state is unmistakable | Players in same room may be distracted; must be obvious | Low | Full-screen overlay or strong highlight, not subtle |
| No browser push notifications required | In-room play; players are nearby, screen change is enough | None | Push notifications are out of scope for co-located play |

### Waiting / Non-Active State

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Non-active players see a clear read-only view | Must know the game is progressing without their input | Low | Already in design |
| Action buttons hidden/disabled when not your turn | Nothing more confusing than tappable UI that silently ignores you | Low | Conditional render based on turn state |
| Activity indicator during polling | Players on slow connections need to know updates are coming | Low | Subtle "syncing" indicator, not intrusive |

### Game Over

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Winner announced clearly | Closure; the game needs to end definitively | Low | Full-screen winner screen |
| Return to lobby / new game option | Players want to play again immediately | Low | "Play again" restarts lobby |

---

## Differentiators (nice to have)

These raise the experience above baseline. None are required for a working game but meaningfully increase perceived quality.

### Tension Amplification

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Roulette spin animation (barrel visible, slow spin) | The roulette moment is the entire product's climax; animation earns its weight | Medium | CSS or SVG animation; 1-2s build-up matters |
| Sound effect for roulette click (safe) | Auditory payoff for the safe outcome | Low | Single audio file, user gesture unlocks it |
| Sound effect for roulette bang (eliminated) | Bigger audio hit for elimination | Low | Distinct from click; louder, more dramatic |
| Card flip sound on challenge reveal | Satisfying micro-feedback | Low | Web Audio API or audio element |

### Turn Communication

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claim history log (scrollable) | Players can review "what did X claim last time?" | Medium | Array of claim events in game state |
| Visual "thinking" indicator when active player is idle | Reduces "is the game frozen?" anxiety during polling wait | Low | Timer dot or animated dots on active player |

### Eliminated Player Experience

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Eliminated players stay on screen watching (read-only) | Reduces social dead time; eliminated friends can follow along | None | Already planned; grayed/skull indicator |
| Clear visual death animation / moment | Elimination should feel like an event, not just a status change | Medium | Quick shake + gray-out transition |

### Polish Moments

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Card deal animation on round start | Sets the pace; makes round reset feel fresh | Medium | Cards slide in from center |
| Selected card lift effect (tap to select) | Immediate tactile-feeling feedback on touch | Low | translateY(-8px) on selected cards |
| Highlight active player row with a border or glow | Instant scan of whose turn it is at a glance | Low | CSS border/shadow change |
| Screen wake lock during active game | Prevents phone screen sleeping mid-session | Low | Screen Wake Lock API; broadly supported in Chrome/Android, fallback for Safari |

### Lobby

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Player joined toast notification | Late joiners feel noticed; host sees progress | Low | Brief toast on each join event |
| Player count vs minimum indicator ("3/2 minimum — ready") | Host knows when they can start | Low | Text below player list |

---

## Anti-Features (deliberately avoid)

These are patterns that make web card games feel annoying, broken, or untrustworthy. Avoid them explicitly.

### Interaction Anti-Patterns

| Anti-Feature | Why Annoying | What to Do Instead |
|--------------|-------------|-------------------|
| Tappable buttons when not your turn | Players tap hoping for feedback, get nothing — feels broken | Hide or visually disable action buttons during others' turns |
| Accidental card play (no confirmation) | One-tap play with no undo causes frustration | Require explicit "Play" button after selection; selection is reversible by tapping again |
| Roulette that auto-fires without player tap | Removes the tension moment, the game's entire point | Always require explicit tap to pull trigger |
| "Nothing happened" after tapping | Silent failures erode trust | Show pending state on Play/Liar! taps immediately even before poll confirms |
| Challenge/Believe buttons appearing on wrong player's screen | If any player can click them, game breaks immediately | Strictly server-enforced + client-enforced: only next player sees these |

### State and Sync Anti-Patterns

| Anti-Feature | Why Annoying | What to Do Instead |
|--------------|-------------|-------------------|
| Slow polling with no activity indicator | "Is it frozen?" — players rage-refresh and break sessions | Show last-updated timestamp or subtle sync spinner |
| Page refresh kicks player from game | Mobile browsers refresh on network drops; lost player breaks the session | Persist player identity in localStorage; rejoin on load if game still in progress |
| Stale state shown without indication | Player acts on old information (e.g., plays against wrong pile count) | Poll on focus regain (visibilitychange event) to sync immediately when tab returns to foreground |
| Ghost player blocking game (disconnected but still in seat) | One disconnected player holds everyone hostage | Detect inactivity (missed N polls) and mark player as disconnected; host can remove |

### Lobby Anti-Patterns

| Anti-Feature | Why Annoying | What to Do Instead |
|--------------|-------------|-------------------|
| No feedback after "Join Game" tap | Player doesn't know if join worked | Optimistic UI + server confirmation |
| Start button always enabled | Host starts with 1 player — broken game | Disable Start below minimum (2 players) |
| Lobby URL changes after host creates game | Players who got URL can't join after navigation | Keep game session tied to stable URL |

### Visual Anti-Patterns

| Anti-Feature | Why Annoying | What to Do Instead |
|--------------|-------------|-------------------|
| Information requiring scroll to see during play | Table Card, pile count, whose turn — must be above fold | Sticky header with core game state |
| Eliminated players disappearing | Breaks social table feel; friends want to watch | Keep visible, grayed with skull |
| Challenge reveal with no animation delay | Instantaneous reveal skips the tension | Minimum 500ms pause before card flip |
| Long animations blocking interaction | Animations that play before next player can act feel like lag | Keep non-critical animations under 600ms; never block input |
| Sound that plays without warning at high volume | In-room play; loud surprise sounds are disruptive | Default sounds off, offer opt-in; if on, keep levels modest |

### Scope Anti-Patterns (resist scope creep)

| Anti-Feature | Why To Avoid | Boundary |
|--------------|-------------|---------|
| In-game chat | Adds complexity; target players are physically together and talking | Out of scope v1 |
| Avatars / profile pictures | Upload/moderation complexity; names are enough | Out of scope v1 |
| Stats / game history | Persistence complexity; not why players come | Out of scope v1 |
| Multiple concurrent games / room codes | State management complexity doubles; one group at a time is the use case | Out of scope v1 |
| Spectator mode (non-players watching) | Edge case; adds auth complexity | Out of scope v1 |

---

## Complexity Notes

### The Roulette Moment is the Entire Product

Everything else is scaffolding. The UX resources spent on the challenge-reveal → roulette-tap → outcome sequence will have a disproportionate return. This sequence needs:
1. A deliberate pause before card reveal (built-in tension)
2. Clear winner/loser announcement
3. A satisfying roulette interaction (tap, not auto)
4. An unmistakable SAFE vs ELIMINATED outcome
5. A brief hold on the outcome before resetting

Animation budget should be concentrated here. Lobby and hand-management animations can be minimal.

### Polling Latency Is a UX Problem, Not Just a Technical One

With 2-second polling intervals, a player's "Your turn" notification can lag up to 2 seconds after the previous player acts. In a room of friends this is tolerable but must be managed:
- Optimistic UI on actions (show "you played X" immediately, before poll confirms)
- Visibility-change polling: trigger immediate poll when tab comes to foreground
- Active player indicator updates the moment the client receives new state

Polling every 2s is adequate for turn-based play; do not add WebSocket complexity to fix a perceived latency issue that players in the same room will not notice.

### Mobile Screen Sleep Is a Real Problem

Players who aren't actively tapping will have their phone screen dim mid-session. Screen Wake Lock API (`navigator.wakeLock.request('screen')`) is supported in Chrome/Android (covers most Android players). Safari on iOS does not support it as of mid-2025; iOS players will need to tap their screen occasionally or disable auto-lock in phone settings. Flag this as a known limitation rather than building a complex workaround.

### Eliminated Player Engagement Is Low Risk Here

Unlike async digital board games where eliminated players wait minutes, this game is physically co-located and sessions are short (minutes, not hours). Eliminated players watching a grayed-out read-only view is acceptable — they're looking at someone else's phone or talking. No need for mini-games or secondary engagement for eliminated players.

### Card Selection UX Must Handle Fat Fingers

Portrait mobile layout with cards at the bottom. Cards must have adequate touch targets (minimum 44x44pt per Apple HIG). Selected cards should visually lift and be de-selectable by tapping again. The Play button should be large and positioned at bottom-thumb-reach, not top of screen (75% of mobile users operate one-handed).

### Turn Claim Display Must Handle All Cases

The claim message ("X played 2 Kings") must gracefully handle:
- The first play (no previous claim to challenge)
- A player emptying their hand (safe status)
- A player being challenged immediately
- A joker being played (still shown as table card in claim)

A claim log (even just the last 3-5 claims) is more useful than a single "latest claim" display, as the next player needs to evaluate what was claimed.

---

## Sources

- [Jackbox Games Design Principles — Built In Chicago](https://www.builtinchicago.org/articles/jackbox-games-design-party-pack)
- [Liar's Bar on Steam — Official Page](https://store.steampowered.com/app/3097560/Liars_Bar/)
- [How to Play Liar's Deck — Full Rules](https://www.debigare.com/how-to-play-liars-deck-from-liars-bar-full-rules-and-variants/)
- [Screen Wake Lock API — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)
- [Screen Wake Lock API — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [Mobile Poker UX — AIS Technolabs](https://www.aistechnolabs.com/blog/what-players-think-about-online-poker-ux)
- [Player Elimination in Board Game Design — Pine Island Games](https://www.pineislandgames.com/blog/player-elimination-mechanics-clank)
- [Card Game Animations — UIKit](https://kazaimazai.com/card-game-animations/)
- [Realistic Card Flip Animation — Auroratide](https://auroratide.com/posts/realistic-flip-animation/)
- [Game Lobby Sample — Unity Docs](https://docs.unity.com/ugs/manual/lobby/manual/game-lobby-sample)
- [Design Patterns for Player Engagement — GameIndustry.com](https://www.gameindustry.com/news-industry-happenings/design-patterns-that-keep-players-engaged-in-modern-game-ux/)
- [Building Scalable Real-Time Multiplayer Card Games — DEV Community](https://dev.to/krishanvijay/building-scalable-real-time-multiplayer-card-games-3kn6)
