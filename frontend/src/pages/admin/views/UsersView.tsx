/** Admin console "Users" tab: filterable table of all users (`listUsers()`) with a
 * suspend/reactivate toggle (`setUserStatus()`) and a CSV export of the current filter. */
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { listUsers, setUserStatus } from '../../../api/client'
import type { UserSummary } from '../../../types/api'
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

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatRegistered(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Quote a CSV field: double any embedded quotes, wrap the lot. Names and addresses carry
 * commas often enough that a naive join corrupts the columns. */
function csvCell(value: string | null) {
  return `"${(value ?? '').replace(/"/g, '""')}"`
}

function exportCsv(rows: UserSummary[]) {
  const csv = [
    ['Name', 'Role', 'Email', 'Phone', 'Status', 'Registered'].join(','),
    ...rows.map((u) => [u.full_name, u.role, u.email, u.phone, u.is_active ? 'Active' : 'Suspended', formatRegistered(u.created_at)].map(csvCell).join(',')),
  ].join('\n')

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `lexflow-users-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
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

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => (role ? users.filter((u) => u.role === role) : users), [users, role])

  function toggleStatus(user: UserSummary) {
    setUserStatus(user.id, !user.is_active)
      .then((updated) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to update status.'))
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
                        {u.is_active ? (
                          <span className={styles.actionBtnDanger} title="Suspend" onClick={() => toggleStatus(u)}><Icon name="ban" size={15} color={C.danger} /></span>
                        ) : (
                          <span className={styles.actionBtn} title="Reactivate" onClick={() => toggleStatus(u)}><Icon name="check-circle" size={15} color={C.success} /></span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
