/** Message thread page (route `/messages/:conversationId`): the client<->lawyer bubble view --
 * polls for new messages while open and lets the current user send one. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConversation, sendMessage } from '../../api/client'
import type { ConversationDetail, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import { C } from '../../components/theme'

const POLL_MS = 12000

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function MessageThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const [profile] = useState<UserProfile | null>(loadProfile)
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    function load() {
      getConversation(Number(conversationId))
        .then((c) => {
          if (cancelled) return
          setError('')
          setConversation((prev) => {
            if (!prev) return c
            const byId = new Map(prev.messages.map((m) => [m.id, m]))
            for (const m of c.messages) byId.set(m.id, m)
            const merged = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
            return { ...c, messages: merged }
          })
        })
        .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this conversation.') })
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
      setError('')
      setConversation((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send your message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FCF9F3', padding: 32, boxSizing: 'border-box', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>Dashboard</span>
          <span style={{ margin: '0 6px' }}>›</span>
          <span style={{ color: C.text, fontWeight: 600 }}>Message {conversation?.other_party_name ?? '…'}</span>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 1px 2px rgba(42,33,24,.04)', display: 'flex', flexDirection: 'column', height: '70vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.primary, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {conversation?.other_party_name ? initialsOf(conversation.other_party_name) : '—'}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{conversation?.other_party_name ?? 'Loading…'}</div>
              <div style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{conversation?.other_party_role ?? ''}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ color: '#B05C5C', fontSize: 13 }}>{error}</div>}
            {conversation?.messages.map((m) => {
              const mine = m.sender_user_id === profile?.user_id
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                    background: mine ? C.primaryDark : '#FBF7EE',
                    color: mine ? '#FFFFFF' : C.text,
                    border: mine ? 'none' : `1px solid ${C.border}`,
                    fontSize: 13.5, lineHeight: 1.4,
                  }}>
                    {m.body}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{formatTime(m.created_at)}</div>
                </div>
              )
            })}
            {conversation && conversation.messages.length === 0 && (
              <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '28px 0' }}>No messages yet — say hello.</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}` }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={`Write a message to ${conversation?.other_party_name ?? '...'}`}
              disabled={sending || !conversation}
              style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }}
            />
            <div
              onClick={() => !sending && handleSend()}
              style={{ width: 42, height: 42, borderRadius: 10, background: C.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1, flexShrink: 0 }}
            >
              <Icon name="send" size={17} color="#FFFFFF" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
