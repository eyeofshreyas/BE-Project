/** Shared file helpers. */

/**
 * Whether the preview page can render this type inline; anything else goes straight to
 * download. For video this asks the browser rather than guessing from the mime type:
 * canPlayType() is the only reliable pre-flight signal, because a <video> pointed at
 * something it can't decode often never fires its error event -- Chrome just sits in
 * NETWORK_LOADING showing a dead player. It rules out MOV, AVI and MPEG outright, and
 * answers "maybe" for MP4/WebM/MKV, where the container is fine but the codecs inside
 * may still not be; the elements keep an onError backstop for that case.
 */
export function canRenderInline(mimeType: string) {
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') return true
  if (mimeType.startsWith('video/')) return document.createElement('video').canPlayType(mimeType) !== ''
  return false
}

/** Bytes as a short human-readable size. */
export function formatSize(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Mirrors MAX_DOCUMENT_BYTES in backend/app/controllers/documents.py. Checked here too so
 * an oversized file fails instantly instead of after uploading, but the server is the
 * authority -- never rely on this alone. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

/** The message to show for a file the upload endpoints would reject, or '' if it's fine. */
export function uploadRejection(file: File) {
  if (file.size === 0) return 'That file is empty.'
  // no file size in the message: formatSize rounds, so a file a byte over the cap would
  // read "That file is 25.0 MB. Documents are limited to 25 MB."
  if (file.size > MAX_DOCUMENT_BYTES) return 'That file is over the 25 MB limit.'
  return ''
}

// esign_status values that mean "nobody signed it" -- the Sign action reopens as "Resend"
// for these instead of staying hidden, same as a document that was never sent. Shared
// between the Documents library and a case's own Documents card, which both show the
// e-signature status -- one implementation instead of two independently drifting ones.
export const ESIGN_RESENDABLE = new Set(['REJECTED', 'EXPIRED'])
const ESIGN_PILL: Record<string, { label: string; color: string; background: string }> = {
  COMPLETED: { label: 'Signed', color: '#4A6B4E', background: '#E4EDE5' },
  REJECTED: { label: 'Signature rejected', color: '#B3282D', background: '#F6E3E1' },
  EXPIRED: { label: 'Signature invite expired', color: '#B3282D', background: '#F6E3E1' },
}
export function esignPill(status: string) {
  return ESIGN_PILL[status] ?? { label: 'Awaiting signature', color: '#8A6A2F', background: '#F3EBD9' }
}

/** Quote a CSV field: double any embedded quotes, wrap the lot. Names, case titles and
 * court names carry commas often enough that a naive join shifts the columns. */
function csvCell(value: string | number | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/** Build a CSV from a header row plus body rows and hand it to the browser as a download,
 * datestamped. Used by the admin console's "Export list" links. */
export function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  const csv = [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
