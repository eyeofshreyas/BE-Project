/** Messages (routes `/messages` and `/messages/:conversationId`): a single split view --
 * every thread the current user participates in on the left, the selected thread's bubbles
 * and composer on the right. Replaces the old separate list/thread pages. */
import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listConversations, listCases, getOrCreateConversation, getConversation, sendMessage } from '../../api/client'
import type { ConversationSummary, ConversationDetail, CaseSummary, UserProfile, MessageSummary } from '../../types/api'
import { formatDate, timeAgo } from '../../utils/date'
import { Icon } from '../../components/icons'
import styles from './MessagesPage.module.css'

const MUTED = '#8C7C5E'
const CLIENT_ROLE_ID = 3
const POLL_MS = 12000

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function dayLabel(iso: string) {
  const now = new Date()
  if (isSameDay(iso, now.toISOString())) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(iso, yesterday.toISOString())) return 'Yesterday'
  return formatDate(iso, { month: 'short', day: 'numeric' })
}

function formatBubbleTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Groups consecutive same-sender messages, and marks where a new calendar day starts, so the
 * thread renders as stacked bubbles under one timestamp with day dividers -- not a fresh
 * timestamp under every line. */
function groupMessages(messages: MessageSummary[]) {
  const groups: { senderId: number; messages: MessageSummary[]; dayLabel: string | null }[] = []
  let lastDay = ''
  for (const m of messages) {
    const day = dayLabel(m.created_at)
    const isNewDay = day !== lastDay
    lastDay = day
    const last = groups[groups.length - 1]
    if (!isNewDay && last && last.senderId === m.sender_user_id) {
      last.messages.push(m)
    } else {
      groups.push({ senderId: m.sender_user_id, messages: [m], dayLabel: isNewDay ? day : null })
    }
  }
  return groups
}

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const [profile] = useState<UserProfile | null>(loadProfile)
  const isClient = profile?.role_id === CLIENT_ROLE_ID

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')
  const autoOpened = useRef(false)

  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [threadError, setThreadError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = isClient
      ? Promise.all([listConversations(), listCases()])
      : listConversations().then((c) => [c, []] as [ConversationSummary[], CaseSummary[]])

    load
      .then(([conversationRows, caseRows]) => { setConversations(conversationRows); setCases(caseRows) })
      .catch((err) => setListError(err instanceof Error ? err.message : 'Failed to load your messages.'))
      .finally(() => setLoadingList(false))
  }, [isClient])

  const primaryCase = cases.find((c) => c.lawyer_id) ?? null

  // A client with no threads yet has exactly one place to go -- open the chat with
  // their lawyer instead of parking them on an empty list. Lawyers only ever reply
  // to threads clients opened, so they don't need this.
  useEffect(() => {
    if (loadingList || listError || autoOpened.current) return
    if (!isClient || conversations.length > 0 || !primaryCase?.lawyer_id) return

    autoOpened.current = true
    getOrCreateConversation(primaryCase.lawyer_id)
      .then((c) => { setConversations([c]); navigate(`/messages/${c.id}`, { replace: true }) })
      .catch((err) => setListError(err instanceof Error ? err.message : 'Failed to open your conversation.'))
  }, [loadingList, listError, isClient, conversations.length, primaryCase, navigate])

  // With threads but no thread picked, default into the most recently active one.
  useEffect(() => {
    if (loadingList || listError || conversationId || conversations.length === 0) return
    navigate(`/messages/${conversations[0].id}`, { replace: true })
  }, [loadingList, listError, conversationId, conversations, navigate])

  useEffect(() => {
    if (!conversationId) { setConversation(null); return }
    let cancelled = false
    setConversation(null)
    setThreadError('')
    function load() {
      getConversation(Number(conversationId))
        .then((c) => {
          if (cancelled) return
          setThreadError('')
          setConversation((prev) => {
            if (!prev) return c
            const byId = new Map(prev.messages.map((m) => [m.id, m]))
            for (const m of c.messages) byId.set(m.id, m)
            const merged = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
            return { ...c, messages: merged }
          })
        })
        .catch((err) => { if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Failed to load this conversation.') })
    }
    load()
    const interval = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [conversation?.messages.length])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !conversationId) return
    setSending(true)
    setDraft('')
    try {
      const message = await sendMessage(Number(conversationId), body)
      setThreadError('')
      setConversation((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev))
      setConversations((prev) => prev.map((c) => (c.id === Number(conversationId) ? { ...c, last_message: message.body, last_message_at: message.created_at } : c)))
    } catch (err) {
      setDraft(body)
      setThreadError(err instanceof Error ? err.message : 'Failed to send your message.')
    } finally {
      setSending(false)
    }
  }

  const filteredConversations = conversations.filter(
    (c) => !search.trim() || (c.other_party_name ?? '').toLowerCase().includes(search.trim().toLowerCase()),
  )
  const groups = conversation ? groupMessages(conversation.messages) : []

  return (
    <div className={styles.page}>
      {listError && <div className={styles.pageError}>{listError}</div>}

      {!listError && (
          <div className={styles.split}>
            <div className={styles.threadList}>
              <div className={styles.threadListHead}>
                <div className={styles.threadListTitle}>Messages</div>
                <div className={styles.threadListCount}>{loadingList ? 'Loading…' : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}</div>
              </div>
              {conversations.length > 1 && (
                <div className={styles.searchBox}>
                  <Icon name="search" size={13} color={MUTED} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…" />
                </div>
              )}
              <div className={styles.threadRows}>
                {filteredConversations.map((c) => (
                  <div
                    key={c.id}
                    className={`${styles.threadRow} ${String(c.id) === conversationId ? styles.active : ''}`}
                    onClick={() => navigate(`/messages/${c.id}`)}
                  >
                    <div className={styles.avatar}>{c.other_party_name ? initialsOf(c.other_party_name) : '—'}</div>
                    <div className={styles.threadMeta}>
                      <div className={styles.threadName}>{c.other_party_name ?? 'Unknown'}</div>
                      <div className={styles.threadPreview}>{c.last_message ?? 'No messages yet'}</div>
                    </div>
                    {c.last_message_at && <div className={styles.threadTime}>{timeAgo(c.last_message_at)}</div>}
                  </div>
                ))}
                {!loadingList && filteredConversations.length === 0 && (
                  <div className={styles.emptyList}>{conversations.length === 0 ? 'No conversations yet.' : 'No matches.'}</div>
                )}
              </div>
            </div>

            <div className={styles.chatPane}>
              {!conversationId || !conversation ? (
                <div className={styles.chatEmpty}>
                  <div className={styles.chatEmptyIcon}><Icon name="message-circle" size={21} color={MUTED} /></div>
                  {loadingList || conversationId ? 'Loading…' : 'No conversation selected.'}
                </div>
              ) : (
                <>
                  <div className={styles.chatHead}>
                    <div className={styles.avatar}>{conversation.other_party_name ? initialsOf(conversation.other_party_name) : '—'}</div>
                    <div>
                      <div className={styles.chatName}>{conversation.other_party_name ?? 'Unknown'}</div>
                      <span className={styles.chatRole}>{conversation.other_party_role}</span>
                    </div>
                  </div>

                  <div className={styles.msgScroll}>
                    <div className={styles.msgStack}>
                      {threadError && <div style={{ color: '#B05C5C', fontSize: 13 }}>{threadError}</div>}
                      {groups.map((g, i) => (
                        <Fragment key={i}>
                          {g.dayLabel && <div className={styles.dayDivider}>{g.dayLabel}</div>}
                          <div className={`${styles.bubbleGroup} ${g.senderId === profile?.user_id ? styles.mine : styles.theirs}`}>
                            {g.messages.map((m) => (
                              <div key={m.id} className={styles.bubble}>
                                {m.body}
                                <span className={styles.bubbleTime}>{formatBubbleTime(m.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        </Fragment>
                      ))}
                      {conversation.messages.length === 0 && (
                        <div className={styles.emptyThread}>No messages yet — say hello.</div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  <div className={styles.composer}>
                    <input
                      className={styles.composerInput}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder={`Write a message to ${conversation.other_party_name ?? '...'}`}
                      disabled={sending}
                    />
                    <div className={styles.sendBtn} style={{ opacity: sending ? 0.6 : 1 }} onClick={() => !sending && handleSend()}>
                      <Icon name="send" size={17} color="#FFFFFF" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
      )}
    </div>
  )
}
