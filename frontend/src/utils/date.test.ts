import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, timeAgo } from './date'

describe('formatDate', () => {
  it('formats an ISO date as "Mon D, YYYY" by default', () => {
    expect(formatDate('2026-03-05T10:00:00Z')).toMatch(/Mar 5, 2026/)
  })

  it('honors custom Intl.DateTimeFormat options', () => {
    expect(formatDate('2026-03-05T10:00:00Z', { year: 'numeric' })).toBe('2026')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says "just now" for under a minute', () => {
    expect(timeAgo(new Date('2026-03-05T11:59:30Z').toISOString())).toBe('just now')
  })

  it('reports minutes under an hour', () => {
    expect(timeAgo(new Date('2026-03-05T11:45:00Z').toISOString())).toBe('15m ago')
  })

  it('reports hours under a day', () => {
    expect(timeAgo(new Date('2026-03-05T09:00:00Z').toISOString())).toBe('3h ago')
  })

  it('reports days beyond a day', () => {
    expect(timeAgo(new Date('2026-03-02T12:00:00Z').toISOString())).toBe('3d ago')
  })
})
