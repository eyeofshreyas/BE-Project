/** Conversation list page (route `/messages`): every client-lawyer thread the current user
 * participates in, most recently active first. Click a row to open its thread. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listConversations, listCases, getOrCreateConversation } from '../../api/client'
import type { ConversationSummary, CaseSummary, UserProfile } from '../../types/api'
import { timeAgo } from '../../utils/date'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const CLIENT_ROLE_ID = 3

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// Same read-and-parse as ClientDashboardPage.tsx's loadProfile -- duplicated
// per-file across the app rather than shared, see that file's note.
function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function MessagesListPage() {
  const navigate = useNavigate()
  const [profile] = useState<UserProfile | null>(loadProfile)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const isClient = profile?.role_id === CLIENT_ROLE_ID

  useEffect(() => {
    // Clients get a "start a conversation" entry point here, which needs their
    // primary case's lawyer -- same pick as ClientDashboardPage's Quick Contact.
    // Lawyers only ever reply to threads clients opened, so they don't need it.
    const load = isClient
      ? Promise.all([listConversations(), listCases()])
      : listConversations().then((c) => [c, []] as [ConversationSummary[], CaseSummary[]])

    load
      .then(([conversationRows, caseRows]) => { setConversations(conversationRows); setCases(caseRows) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your messages.'))
      .finally(() => setLoading(false))
  }, [isClient])

  const primaryCase = cases.find((c) => c.lawyer_id) ?? null

  async function startConversation(lawyerId: number) {
    setStarting(true)
    try {
      const conversation = await getOrCreateConversation(lawyerId)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open your conversation.')
    } finally {
      setStarting(false)
    }
  }

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
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <div style={{ color: MUTED, fontSize: 13 }}>No conversations yet.</div>
                {isClient && primaryCase?.lawyer_id && (
                  <div
                    className={styles.darkBtn}
                    style={{ marginTop: 14, opacity: starting ? 0.6 : 1, cursor: starting ? 'default' : 'pointer' }}
                    onClick={() => !starting && startConversation(primaryCase.lawyer_id!)}
                  >
                    Message {primaryCase.lawyer ?? 'your lawyer'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
