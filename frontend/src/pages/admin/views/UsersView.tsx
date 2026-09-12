/** Admin console "Users" tab: filterable table of all users (`listUsers()`) with a CSV
 * export of the current filter, a suspend/reactivate toggle (`setUserStatus()`), and a
 * view/edit/delete panel over `getUserDeleteImpact()`, `adminUpdateUser()` and
 * `deleteUser()`. */
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { adminUpdateUser, deleteUser, getUserDeleteImpact, listUsers, setUserStatus } from '../../../api/client'
import type { UserDeleteImpact, UserSummary } from '../../../types/api'
import { downloadCsv } from '../../../utils/files'
import styles from '../../../components/AppShell.module.css'

const USER_COLUMNS = ['User', 'Role', 'Email', 'Phone', 'Status', 'Registered', 'Actions']

const ROLE_COLORS: Record<string, string> = { Lawyer: C.primary, Client: '#575145', Admin: C.danger }

/** Chip label -> the `role` it keeps, or null for "everyone". */
const FILTERS: { label: string; role: string | null }[] = [
  { label: 'All Users', role: null },
  { label: 'Lawyers', role: 'Lawyer' },
  { label: 'Clients', role: 'Client' },
  { label: 'Admins', role: 'Admin' },
]

type PanelMode = 'view' | 'edit' | 'delete'

/** Impact fields worth showing, in reading order. Zero rows are hidden -- a delete preview
 * listing eight zeroes buries the one number that matters. */
const IMPACT_ROWS: { key: keyof UserDeleteImpact; label: string }[] = [
  { key: 'cases', label: 'Cases' },
  { key: 'matters', label: 'Conveyancing matters' },
  { key: 'documents', label: 'Documents' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'hearings', label: 'Hearings' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'case_assignments', label: 'Case assignments' },
]

const FIELD_LABEL = { fontSize: 12.5, fontWeight: 600, color: '#575145', marginBottom: 6 }
const INPUT = { width: '100%', boxSizing: 'border-box' as const, background: '#F6F2E9', border: `1.5px solid ${C.border}`, borderRadius: 3, padding: '11px 13px', fontSize: 13.5, color: C.text, fontFamily: "'Public Sans',sans-serif", outline: 'none' }
const BTN_GHOST = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: '#FCFAF4', color: C.text, border: `1px solid ${C.border}` }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)' }

function attachedRows(impact: UserDeleteImpact) {
  return IMPACT_ROWS.filter((r) => (impact[r.key] as number) > 0)
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatRegistered(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function exportCsv(rows: UserSummary[]) {
  downloadCsv(
    'lexflow-users',
    ['Name', 'Role', 'Email', 'Phone', 'Status', 'Registered'],
    rows.map((u) => [u.full_name, u.role, u.email, u.phone, u.is_active ? 'Active' : 'Suspended', formatRegistered(u.created_at)]),
  )
}

/**
 * Fetches every user once via `listUsers()` and filters by role in memory (the chips are
 * a view over rows already in hand, not a refetch each click). The ban/check-circle action
 * calls `setUserStatus()` to suspend/reactivate and patches the result into local state.
 */
export default function UsersView() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ user: UserSummary; mode: PanelMode } | null>(null)
  const [impact, setImpact] = useState<UserDeleteImpact | null>(null)
  const [draft, setDraft] = useState({ full_name: '', phone: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => (role ? users.filter((u) => u.role === role) : users), [users, role])

  function openPanel(user: UserSummary, mode: PanelMode) {
    setPanel({ user, mode })
    setDraft({ full_name: user.full_name, phone: user.phone })
    if (mode === 'edit') return
    // View and delete both want the same answer: what is attached to this person?
    setImpact(null)
    getUserDeleteImpact(user.id).then(setImpact).catch(() => setImpact(null))
  }

  function closePanel() {
    setPanel(null)
    setImpact(null)
  }

  function saveEdit() {
    if (!panel) return
    setBusy(true)
    adminUpdateUser(panel.user.id, { full_name: draft.full_name.trim(), phone: draft.phone.trim() })
      .then((updated) => {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
        closePanel()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save user.'))
      .finally(() => setBusy(false))
  }

  function confirmDelete() {
    if (!panel) return
    setBusy(true)
    deleteUser(panel.user.id)
      .then(() => {
        setUsers((prev) => prev.filter((u) => u.id !== panel.user.id))
        closePanel()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to delete user.'))
      .finally(() => setBusy(false))
  }

  function toggleStatus(user: UserSummary) {
    setBusy(true)
    setUserStatus(user.id, !user.is_active)
      .then((updated) => {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
        // Keep the open panel in step -- suspending from inside it must flip its own
        // status pill and button, not just the row behind it.
        setPanel((prev) => (prev && prev.user.id === updated.id ? { ...prev, user: updated } : prev))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to update status.'))
      .finally(() => setBusy(false))
  }

  return (
    <>
      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Users</div>
          <div className={styles.pageSubtitle}>Lawyers, clients and administrators registered on LexFlow.</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Users</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, cursor: 'pointer' }} onClick={() => exportCsv(visible)}>Export list</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map((f) => {
            const active = f.role === role
            return (
              <div
                key={f.label}
                className={styles.chipBase}
                style={{ borderRadius: 999, padding: '7px 16px', background: active ? '#F6EFDD' : 'transparent', border: `1px solid ${active ? C.primaryDark : C.border}`, color: active ? C.primaryDark : '#575145' }}
                onClick={() => setRole(f.role)}
              >
                {f.label}
              </div>
            )
          })}
        </div>

        {loading && <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>Loading users…</div>}
        {error && <div style={{ padding: '24px 4px', color: C.danger, fontSize: 13.5 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>{USER_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td className={styles.td} colSpan={USER_COLUMNS.length} style={{ color: C.muted }}>No users match this filter.</td></tr>
                )}
                {visible.map((u) => (
                  <tr key={u.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.secondary, color: C.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: "'Spectral',serif", flexShrink: 0 }}>{initialsOf(u.full_name)}</div>
                        <span style={{ fontWeight: 600, color: '#1A1A17' }}>{u.full_name}</span>
                      </div>
                    </td>
                    <td className={styles.td}>{u.role && <span className={styles.pill} style={pillStyle(ROLE_COLORS[u.role] ?? C.muted)}>{u.role}</span>}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{u.email}</td>
                    <td className={styles.td} style={{ color: '#6E6759' }}>{u.phone}</td>
                    <td className={styles.td}><span className={styles.pill} style={pillStyle(u.is_active ? C.success : C.danger)}>{u.is_active ? 'Active' : 'Suspended'}</span></td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{formatRegistered(u.created_at)}</td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span className={styles.actionBtn} title="View" onClick={() => openPanel(u, 'view')}><Icon name="eye" size={15} color="#575145" /></span>
                        <span className={styles.actionBtn} title="Edit" onClick={() => openPanel(u, 'edit')}><Icon name="edit" size={15} color="#575145" /></span>
                        {u.is_active ? (
                          <span className={styles.actionBtn} title="Suspend" onClick={() => toggleStatus(u)}><Icon name="ban" size={15} color={C.warning} /></span>
                        ) : (
                          <span className={styles.actionBtn} title="Reactivate" onClick={() => toggleStatus(u)}><Icon name="check-circle" size={15} color={C.success} /></span>
                        )}
                        <span className={styles.actionBtnDanger} title="Delete permanently" onClick={() => openPanel(u, 'delete')}><Icon name="trash-2" size={15} color={C.danger} /></span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {panel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(35, 48, 107,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={closePanel}>
          <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 28, width: 'min(520px,100%)', maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.secondary, color: C.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, fontFamily: "'Spectral',serif", flexShrink: 0 }}>{initialsOf(panel.user.full_name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Spectral',serif", fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{panel.user.full_name}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{panel.user.role ?? 'No role'} · joined {formatRegistered(panel.user.created_at)}</div>
              </div>
              <span className={styles.actionBtn} onClick={closePanel} title="Close"><Icon name="x" size={15} color="#6E6759" /></span>
            </div>

            {panel.mode === 'edit' ? (
              <>
                <div>
                  <div style={FIELD_LABEL}>Full Name</div>
                  <input value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} style={INPUT} />
                </div>
                <div>
                  <div style={FIELD_LABEL}>Phone Number</div>
                  <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} style={INPUT} />
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>Email can't be changed here — it's the only link between this row and the account's login.</div>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><div style={FIELD_LABEL}>Email</div><div style={{ fontSize: 13.5, color: C.text, wordBreak: 'break-all' }}>{panel.user.email}</div></div>
                  <div><div style={FIELD_LABEL}>Phone</div><div style={{ fontSize: 13.5, color: C.text }}>{panel.user.phone}</div></div>
                  <div><div style={FIELD_LABEL}>Status</div><span className={styles.pill} style={pillStyle(panel.user.is_active ? C.success : C.danger)}>{panel.user.is_active ? 'Active' : 'Suspended'}</span></div>
                </div>

                <div>
                  <div style={FIELD_LABEL}>{panel.mode === 'delete' ? 'This will also be destroyed' : 'Attached records'}</div>
                  {!impact && <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>}
                  {impact && attachedRows(impact).length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Nothing is attached to this account.</div>}
                  {impact && attachedRows(impact).map((r) => (
                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid #F1EDE0' }}>
                      <span style={{ color: '#33302A' }}>{r.label}</span><span style={{ fontWeight: 700, color: C.text }}>{impact[r.key] as number}</span>
                    </div>
                  ))}
                </div>

                {panel.mode === 'delete' && (
                  <div style={{ background: '#FDEDEC', border: `1px solid ${C.danger}`, borderRadius: 3, padding: '12px 14px', fontSize: 12.5, color: '#7A1F22', lineHeight: 1.5 }}>
                    This permanently deletes the account and everything listed above. It cannot be undone. Suspend account keeps all of it and just blocks sign-in.
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <div style={BTN_GHOST} onClick={closePanel}>{panel.mode === 'view' ? 'Close' : 'Cancel'}</div>
              {panel.mode !== 'edit' && (
                <div
                  style={{ ...BTN_GHOST, color: panel.user.is_active ? C.warning : C.success, borderColor: panel.user.is_active ? C.warning : C.success, opacity: busy ? 0.6 : 1 }}
                  onClick={() => { if (!busy) toggleStatus(panel.user) }}
                >
                  {panel.user.is_active ? 'Suspend account' : 'Reactivate account'}
                </div>
              )}
              {panel.mode === 'edit' && <div style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }} onClick={() => { if (!busy) saveEdit() }}>{busy ? 'Saving…' : 'Save changes'}</div>}
              {panel.mode === 'delete' && <div style={{ ...BTN_PRIMARY, background: C.danger, boxShadow: 'none', opacity: busy || !impact ? 0.6 : 1 }} onClick={() => { if (!busy && impact) confirmDelete() }}>{busy ? 'Deleting…' : 'Delete permanently'}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
