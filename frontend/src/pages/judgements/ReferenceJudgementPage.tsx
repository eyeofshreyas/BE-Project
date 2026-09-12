/** `/judgements/reference/:docId` route: one judgement out of the IN-Abs reference corpus,
 * reached from a `/ai/similar-cases` hit on a case's AI summary. Its headnote and full text
 * run to thousands of words, which is why this is a page and not an overlay. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSimilarCase } from '../../api/client'
import type { SimilarCaseDetail } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#6E6759'
const PRIMARY = '#23306B'

export default function ReferenceJudgementPage() {
  const { docId = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<SimilarCaseDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!docId) { setError('Invalid judgement.'); return }
    getSimilarCase(docId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this judgement.'))
  }, [docId])

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.breadcrumb}>
          {/* the corpus isn't browsable, so this goes back to wherever the hit was, not to a list */}
          <span style={{ cursor: 'pointer' }} onClick={() => navigate(-1)}>Back</span>
          <span>&rsaquo;</span>
          <span>{docId}</span>
        </div>

        <div className={styles.header}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="gavel" size={21} color={PRIMARY} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className={styles.title} style={{ fontSize: 20 }}>{detail?.citation ?? docId}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.08em' }}>
                IN-ABS REFERENCE CORPUS · {docId}
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ padding: '24px 4px', color: '#B3282D', fontSize: 13.5 }}>{error}</div>}
        {!error && !detail && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading judgement…</div>}

        {detail?.summary && (
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>Headnote</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: '#33302A', whiteSpace: 'pre-wrap' }}>{detail.summary}</div>
          </div>
        )}

        {detail && (
          <div className={styles.panelCard} style={{ marginTop: 16 }}>
            <div className={styles.panelTitle}>Full judgement</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#33302A', whiteSpace: 'pre-wrap' }}>{detail.text}</div>
          </div>
        )}
      </div>
    </div>
  )
}
