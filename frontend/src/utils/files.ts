/** Shared file helpers. */

/** Whether the document preview page can render this type inline; anything else
 * (Word docs, etc.) goes straight to download instead. */
export function isPreviewable(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType === 'application/pdf'
}

/** Bytes as a short human-readable size. */
export function formatSize(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
