/** Modal that reads one judgement out of the IN-Abs reference corpus by the `doc_id` an
 * `/ai/similar-cases` hit carries -- used by `DocumentsListPage` and `CaseDetailPage`. */
import { useEffect, useState } from 'react'
import { getSimilarCase } from '../api/client'
import type { SimilarCaseDetail } from '../types/api'
import { Icon } from './icons'
import styles from '../pages/conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'

/** Reads one IN-Abs judgment behind a "Similar" hit -- its headnote summary and full text. */
export default function SimilarCaseModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SimilarCaseDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getSimilarCase(docId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this judgement.'))
  }, [docId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(35, 48, 107,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div style={{ background: '#FCFAF4', borderRadius: 3, width: 'min(820px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 48px rgba(0,0,0,.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '14px 18px', borderBottom: '1px solid #CFC6B0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A17' }}>{detail?.citation ?? docId}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.08em' }}>
              IN-ABS REFERENCE CORPUS · {docId}
            </div>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="x" size={16} color="#575145" /></span>
        </div>

        <div style={{ overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ color: '#B3282D', fontSize: 13 }}>{error}</div>}
          {!error && !detail && <div style={{ color: MUTED, fontSize: 13 }}>Loading judgement…</div>}
          {detail?.summary && (
            <div>
              <div className={styles.sectionTitle} style={{ fontSize: 13 }}>Headnote</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#33302A', whiteSpace: 'pre-wrap' }}>{detail.summary}</div>
            </div>
          )}
          {detail && (
            <div>
              <div className={styles.sectionTitle} style={{ fontSize: 13 }}>Full judgement</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#33302A', whiteSpace: 'pre-wrap' }}>{detail.text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
