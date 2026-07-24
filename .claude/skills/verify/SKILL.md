---
name: verify
description: Drive Liar's Bar end-to-end in a real browser (two players) to verify a change
---

## Build & run

```bash
npm run build   # always run this — Next's client-component ("use client") SWC loader
                # has caught real parse bugs in bundled deps (see gotcha below) that
                # tsc --noEmit and vitest never see, since they don't touch the client bundle
npm run dev     # starts on http://localhost:3000; needs Redis creds in
                # .env.development.local (KV_REST_API_URL/TOKEN) to actually create/join games
```

No project-native browser automation is installed. To drive the UI:

```bash
mkdir -p /tmp/pw-verify && cd /tmp/pw-verify && npm init -y && npm install playwright@1.61.1
npx playwright@1.61.1 install chromium   # ~260MB, needed once per machine
```

Write a `.mjs` script using `import { chromium } from 'playwright'`, `chromium.launch()`,
`browser.newContext()` per simulated player (separate localStorage/session), drive with
`page.getByRole`/`getByPlaceholder`. Two real players are usually necessary — most of this
app's behavior (state propagation, turn order, challenge/roulette) only shows up cross-tab.

## Key UI selectors (app/page.tsx home screen)

- Name input: `getByPlaceholder(/name/i)`
- Create: `getByRole('button', { name: /create/i })` → navigates to `/lobby`
- Join is two-step: click `getByRole('button', { name: 'Join Existing Game' })` first to
  reveal the code field (`getByPlaceholder('XXXXXX')`), fill it, THEN click the separate
  exact `getByRole('button', { name: 'Join', exact: true })`. A single `/join/i` regex
  match will hit the toggle button, not the real submit — it'll look like it worked and
  then hang.
- Join code display in lobby: `text=/^[A-Z0-9]{4}$/`
- Start: `getByRole('button', { name: 'Start Game' })` (disabled until 2+ players — safe
  to `.click({ timeout: ... })` and let Playwright's actionability wait ride out the
  fallback poll interval instead of a manual wait)
- Challenge prompt: `text=Do you believe them?`, buttons `'Believe'` / `'Liar!'`
- Roulette pull: `getByRole('button', { name: /Pull the Trigger/ })` (only rendered for
  the loser — check `.count()` on both tabs, don't assume which side lost)
- Roulette result overlay: `text=/SURVIVED|ELIMINATED/`, auto-dismisses after ~2.3s — poll
  every ~1s rather than a single wait+screenshot, or you'll miss it

## Gotchas

- **Ably's browser bundle (`ably` / `ably/modular`) fails to parse under Next's
  client-component SWC loader**: `Module parse failed: 'super' keyword outside a method`.
  This is a real (valid ES2015+) `super(...)`-inside-arrow-function pattern in Ably's
  `ErrorInfo` class that Next's flight-loader chokes on — not our bug, not fixable by
  bundler config tweaks we found. Workaround in `lib/useGameChannel.ts`: load Ably from
  their CDN script (`cdn.ably.com/lib/ably.min-2.js`) into `window.Ably` instead of
  bundling the npm package client-side. The `ably` npm package itself stays a normal
  dependency for server-side use (`lib/realtime.ts`), which isn't affected. If touching
  the client Ably integration again, re-run `npm run build` — `vitest`/`tsc` alone won't
  catch a regression here.
- **`ABLY_API_KEY` is not set in this environment** (only `KV_REST_API_*`/Redis creds are
  in `.env.development.local`) — `/api/ably-token` will always 503 here, and no real Ably
  WebSocket connection can be established. State propagation falls back entirely to the
  SWR poll interval (`refreshInterval`, currently 12s in both `app/lobby/page.tsx` and
  `app/game/page.tsx`). Any test relying on real push needs a real key supplied by the
  user — don't assume push works just because the fallback path does.
- Expect an uncaught `pageerror: "Connection closed"` in the browser console on every
  lobby→game navigation while Ably can't authenticate (traced to Ably's own internal
  `ConnectionErrors.closed()` rejecting an in-flight promise when `.close()` is called
  mid-retry). Doesn't break the app; known rough edge when Ably is unreachable/unkeyed.
- The pre-existing test `lib/redis.test.ts > checkRedisHealth > ... PONG` fails in this
  shell because Redis env vars aren't exported into the plain `npm run test` process —
  unrelated to app changes, don't chase it.
