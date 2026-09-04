/** Conversation list page (route `/messages`): every client-lawyer thread the current user
 * participates in, most recently active first. Click a row to open its thread. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listConversations } from '../../api/client'
import type { ConversationSummary } from '../../types/api'
import { timeAgo } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function MessagesListPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your messages.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Messages</div>
            <div className={styles.subtitle}>Conversations with your lawyers and clients.</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your messages…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableCard}>
            {conversations.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderTop: '1px solid #F1E9D9', cursor: 'pointer' }}
                onClick={() => navigate(`/messages/${c.id}`)}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#B08D3E', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {c.other_party_name ? initialsOf(c.other_party_name) : '—'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#2A2118' }}>{c.other_party_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message ?? 'No messages yet'}</div>
                </div>
                {c.last_message_at && <div style={{ fontSize: 11.5, color: MUTED, flexShrink: 0 }}>{timeAgo(c.last_message_at)}</div>}
              </div>
            ))}
            {conversations.length === 0 && (
              <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '28px 0' }}>No conversations yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
