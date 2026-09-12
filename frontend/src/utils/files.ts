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
