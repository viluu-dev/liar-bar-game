import { describe, it, expect } from 'vitest'
import { rotateToEgocentric, computeSeatPosition } from './seat-layout'

describe('rotateToEgocentric', () => {
  it('puts the selected index first', () => {
    expect(rotateToEgocentric(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('is a no-op when selfIndex is already 0', () => {
    expect(rotateToEgocentric(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
  })

  it('wraps around correctly when selfIndex is the last element', () => {
    expect(rotateToEgocentric(['a', 'b', 'c', 'd'], 3)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('preserves relative order of the remaining elements', () => {
    const result = rotateToEgocentric([1, 2, 3, 4, 5], 1)
    expect(result).toEqual([2, 3, 4, 5, 1])
  })

  it('handles a two-player table', () => {
    expect(rotateToEgocentric(['a', 'b'], 1)).toEqual(['b', 'a'])
  })

  it('handles a single-element array', () => {
    expect(rotateToEgocentric(['only'], 0)).toEqual(['only'])
  })

  it('returns the array unchanged when selfIndex is negative (not-found sentinel)', () => {
    const items = ['a', 'b', 'c']
    expect(rotateToEgocentric(items, -1)).toEqual(items)
  })
})

describe('computeSeatPosition', () => {
  const RADIUS = 42

  it('places seat 0 (me) at the bottom-center of the circle', () => {
    const { xPct, yPct } = computeSeatPosition(0, 4, RADIUS)
    expect(xPct).toBeCloseTo(50)
    expect(yPct).toBeCloseTo(50 + RADIUS)
  })

  it('distributes 4 seats evenly, 90 degrees apart, clockwise from the bottom', () => {
    const seat0 = computeSeatPosition(0, 4, RADIUS)
    const seat1 = computeSeatPosition(1, 4, RADIUS)
    const seat2 = computeSeatPosition(2, 4, RADIUS)
    const seat3 = computeSeatPosition(3, 4, RADIUS)

    expect(seat0.xPct).toBeCloseTo(50)
    expect(seat0.yPct).toBeCloseTo(50 + RADIUS)

    expect(seat1.xPct).toBeCloseTo(50 - RADIUS) // left
    expect(seat1.yPct).toBeCloseTo(50)

    expect(seat2.xPct).toBeCloseTo(50)
    expect(seat2.yPct).toBeCloseTo(50 - RADIUS) // top

    expect(seat3.xPct).toBeCloseTo(50 + RADIUS) // right
    expect(seat3.yPct).toBeCloseTo(50)
  })

  it('distributes 8 seats evenly, 45 degrees apart', () => {
    for (let i = 0; i < 8; i++) {
      const { xPct, yPct } = computeSeatPosition(i, 8, RADIUS)
      const dx = xPct - 50
      const dy = yPct - 50
      // Every seat sits exactly RADIUS away from center, regardless of angle.
      expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(RADIUS)
    }
  })

  it('handles a 2-player table (seats directly opposite each other)', () => {
    const seat0 = computeSeatPosition(0, 2, RADIUS)
    const seat1 = computeSeatPosition(1, 2, RADIUS)

    expect(seat0.xPct).toBeCloseTo(50)
    expect(seat0.yPct).toBeCloseTo(50 + RADIUS)
    expect(seat1.xPct).toBeCloseTo(50)
    expect(seat1.yPct).toBeCloseTo(50 - RADIUS)
  })

  it('defaults radiusPct to 42 when omitted', () => {
    const withDefault = computeSeatPosition(0, 4)
    const explicit = computeSeatPosition(0, 4, 42)
    expect(withDefault).toEqual(explicit)
  })

  it('every seat lies exactly radiusPct away from the 50/50 center, for any total', () => {
    for (const total of [2, 3, 5, 6, 7]) {
      for (let i = 0; i < total; i++) {
        const { xPct, yPct } = computeSeatPosition(i, total, RADIUS)
        const dist = Math.sqrt((xPct - 50) ** 2 + (yPct - 50) ** 2)
        expect(dist).toBeCloseTo(RADIUS)
      }
    }
  })
})
