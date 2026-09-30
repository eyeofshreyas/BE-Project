import { describe, expect, it } from 'vitest'
import { formatCompactINR } from './money'

describe('formatCompactINR', () => {
  it('renders a plain grouped figure under 1 lakh', () => {
    expect(formatCompactINR(42_000)).toBe('₹42,000')
  })

  it('renders lakhs with one decimal', () => {
    expect(formatCompactINR(6_500_000)).toBe('₹65.0 L')
  })

  it('renders crores with one decimal', () => {
    expect(formatCompactINR(24_000_000)).toBe('₹2.4 Cr')
  })

  it('treats the lakh boundary as inclusive', () => {
    expect(formatCompactINR(100_000)).toBe('₹1.0 L')
  })

  it('treats the crore boundary as inclusive', () => {
    expect(formatCompactINR(10_000_000)).toBe('₹1.0 Cr')
  })

  it('handles zero', () => {
    expect(formatCompactINR(0)).toBe('₹0')
  })
})
