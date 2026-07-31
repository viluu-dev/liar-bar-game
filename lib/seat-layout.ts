/**
 * Pure seat-geometry math for the circular round-table layout.
 * No React, no game-state knowledge — just array rotation and trigonometry.
 */

/** Rotates the array so `selfIndex` is first — seat 0 is always "me." */
export function rotateToEgocentric<T>(items: T[], selfIndex: number): T[] {
  if (selfIndex < 0) return items
  return items.map((_, i) => items[(selfIndex + i) % items.length])
}

/** Percentage-based (0-100) x/y for seat `i` of `total`, on a circle of `radiusPct` around center. */
export function computeSeatPosition(i: number, total: number, radiusPct = 42) {
  const angleDeg = 90 + (360 / total) * i   // seat 0 (me) at the bottom (90°), others fan out clockwise
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    xPct: 50 + radiusPct * Math.cos(angleRad),
    yPct: 50 + radiusPct * Math.sin(angleRad),
  }
}
