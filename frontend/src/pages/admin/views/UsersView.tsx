import { useEffect, useState } from 'react'
import { Icon } from '../icons'
import { C, pillStyle } from '../theme'
import { listUsers, setUserStatus, type UserSummary } from '../../../lib/api'
import styles from '../adminShared.module.css'

const USER_COLUMNS = ['User', 'Role', 'Email', 'Phone', 'Status', 'Registered', 'Actions']

const ROLE_COLORS: Record<string, string> = { Lawyer: C.primary, Client: '#6A5C42', Admin: C.danger }

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function UsersView() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

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
                {users.map((u) => (
                  <tr key={u.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.secondary, color: C.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: "'Poppins',sans-serif", flexShrink: 0 }}>{initialsOf(u.full_name)}</div>
                        <span style={{ fontWeight: 600, color: '#2A2118' }}>{u.full_name}</span>
                      </div>
                    </td>
                    <td className={styles.td}>{u.role && <span className={styles.pill} style={pillStyle(ROLE_COLORS[u.role] ?? C.muted)}>{u.role}</span>}</td>
                    <td className={styles.td} style={{ color: '#3D3126' }}>{u.email}</td>
                    <td className={styles.td} style={{ color: '#8C7C5E' }}>{u.phone}</td>
                    <td className={styles.td}><span className={styles.pill} style={pillStyle(u.is_active ? C.success : C.danger)}>{u.is_active ? 'Active' : 'Suspended'}</span></td>
                    <td className={styles.td} style={{ color: '#3D3126' }}>{new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {u.is_active ? (
                          <span className={styles.actionBtn} title="Suspend" onClick={() => toggleStatus(u)}><Icon name="ban" size={15} color={C.warning} /></span>
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
