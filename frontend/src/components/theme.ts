/** Shared color palette (`C`) and style helpers for the admin console (`AdminConsolePage` and `admin/views/*`). */
import type { CSSProperties } from 'react'

export const C = {
  primary: '#23306B',
  primaryDark: '#1A2551',
  secondary: '#CFC6B0',
  border: '#CFC6B0',
  text: '#1A1A17',
  muted: '#6E6759',
  success: '#4A6B4E',
  warning: '#8A6A2F',
  danger: '#B3282D',
}

/** Builds a translucent pill background (color + 12% alpha) with matching text color, for status badges. */
export function pillStyle(color: string): CSSProperties {
  return { color, background: color + '1f' }
}
