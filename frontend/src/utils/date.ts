/** Shared date-formatting helpers used across pages for displaying ISO timestamps. */
const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

/** Formats an ISO date string using `Intl.DateTimeFormat`, defaulting to "Mon D, YYYY". */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS) {
  return new Date(iso).toLocaleString(undefined, opts)
}

/** Converts an ISO timestamp into a relative "Xm/Xh/Xd ago" string. */
export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
