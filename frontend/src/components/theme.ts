/** Shared color palette (`C`) and style helpers for the admin console (`AdminConsolePage` and `admin/views/*`). */
import type { CSSProperties } from 'react'

export const C = {
  primary: '#B08D3E',
  primaryDark: '#8f6743',
  secondary: '#D8C79A',
  border: '#E7DCC6',
  text: '#2A2118',
  muted: '#8C7C5E',
  success: '#4CAF50',
  warning: '#FFB74D',
  danger: '#EF5350',
}

/** Builds a translucent pill background (color + 12% alpha) with matching text color, for status badges. */
export function pillStyle(color: string): CSSProperties {
  return { color, background: color + '1f' }
}
