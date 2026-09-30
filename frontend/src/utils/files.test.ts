import { describe, expect, it } from 'vitest'
import { canRenderInline, esignPill, formatSize, MAX_DOCUMENT_BYTES, uploadRejection } from './files'

describe('canRenderInline', () => {
  it('allows images and PDFs', () => {
    expect(canRenderInline('image/png')).toBe(true)
    expect(canRenderInline('application/pdf')).toBe(true)
  })

  it('rejects everything else that is not a video', () => {
    expect(canRenderInline('application/zip')).toBe(false)
    expect(canRenderInline('text/plain')).toBe(false)
  })

  it('defers to the browser for video, which jsdom reports as unplayable', () => {
    // jsdom has no real media stack, so canPlayType() always returns '' here --
    // this only exercises the video branch's wiring, not real codec detection.
    expect(canRenderInline('video/mp4')).toBe(false)
  })
})

describe('formatSize', () => {
  it('renders null as an em dash', () => {
    expect(formatSize(null)).toBe('—')
  })

  it('renders sub-MB sizes in KB', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB')
  })

  it('renders MB-and-above sizes in MB with one decimal', () => {
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('uploadRejection', () => {
  function fileOfSize(bytes: number): File {
    return new File([new Uint8Array(bytes)], 'doc.pdf', { type: 'application/pdf' })
  }

  it('rejects an empty file', () => {
    expect(uploadRejection(fileOfSize(0))).toBe('That file is empty.')
  })

  it('rejects a file over the 25 MB cap', () => {
    expect(uploadRejection(fileOfSize(MAX_DOCUMENT_BYTES + 1))).toBe('That file is over the 25 MB limit.')
  })

  it('accepts a file exactly at the cap', () => {
    expect(uploadRejection(fileOfSize(MAX_DOCUMENT_BYTES))).toBe('')
  })

  it('accepts an ordinary file', () => {
    expect(uploadRejection(fileOfSize(1024))).toBe('')
  })
})

describe('esignPill', () => {
  it('maps known statuses to their pill', () => {
    expect(esignPill('COMPLETED').label).toBe('Signed')
    expect(esignPill('REJECTED').label).toBe('Signature rejected')
    expect(esignPill('EXPIRED').label).toBe('Signature invite expired')
  })

  it('falls back to "Awaiting signature" for anything else', () => {
    expect(esignPill('SENT').label).toBe('Awaiting signature')
    expect(esignPill('').label).toBe('Awaiting signature')
  })
})
