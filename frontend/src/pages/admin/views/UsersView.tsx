import { Icon } from '../icons'
import { C, pillStyle } from '../theme'
import styles from '../adminShared.module.css'

const USER_COLUMNS = ['User', 'Role', 'Email', 'Phone', 'Status', 'Registered', 'Actions']

const ROLE_COLORS: Record<string, string> = { Lawyer: C.primary, Client: '#6A5C42', Admin: C.danger }

const USERS = [
  { name: 'Kavita Menon', role: 'Lawyer', email: 'kavita.menon@lexfirm.in', phone: '+91 98200 11234', status: 'Active', registered: '14 Jan 2026' },
  { name: 'Rajesh Sharma', role: 'Client', email: 'rajesh.sharma@gmail.com', phone: '+91 90040 55210', status: 'Active', registered: '22 Feb 2026' },
  { name: 'Arjun Nair', role: 'Lawyer', email: 'arjun.nair@lexfirm.in', phone: '+91 98450 22190', status: 'Active', registered: '03 Mar 2026' },
  { name: 'Anita Verma', role: 'Client', email: 'anita.verma@vermatextiles.com', phone: '+91 99870 33456', status: 'Suspended', registered: '11 Apr 2026' },
  { name: 'Priya Deshmukh', role: 'Lawyer', email: 'priya.deshmukh@lexfirm.in', phone: '+91 97400 88712', status: 'Active', registered: '29 May 2026' },
]

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function UsersView() {
  return (
    <>
      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Users</div>
          <div className={styles.pageSubtitle}>Lawyers, clients and administrators registered on LexFlow.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className={styles.chipBase} style={{ color: '#FFFFFF', background: C.primary, boxShadow: '0 4px 12px rgba(176,141,62,.28)' }}>
            <Icon name="user-plus" size={15} color="#FFFFFF" /><span>Add New Lawyer</span>
          </div>
          <div className={styles.chipBase} style={{ color: '#3D3126', background: '#FFFFFF', border: `1px solid ${C.border}` }}>
            <Icon name="user-plus" size={15} color={C.primaryDark} /><span>Add New Client</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>All Users</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, cursor: 'pointer' }}>Export list</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>{USER_COLUMNS.map((col) => <th key={col} className={styles.th}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {USERS.map((u) => (
                <tr key={u.email} className={styles.tr}>
                  <td className={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.secondary, color: C.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: "'Poppins',sans-serif", flexShrink: 0 }}>{initialsOf(u.name)}</div>
                      <span style={{ fontWeight: 600, color: '#2A2118' }}>{u.name}</span>
                    </div>
                  </td>
                  <td className={styles.td}><span className={styles.pill} style={pillStyle(ROLE_COLORS[u.role])}>{u.role}</span></td>
                  <td className={styles.td} style={{ color: '#3D3126' }}>{u.email}</td>
                  <td className={styles.td} style={{ color: '#8C7C5E' }}>{u.phone}</td>
                  <td className={styles.td}><span className={styles.pill} style={pillStyle(u.status === 'Active' ? C.success : C.danger)}>{u.status}</span></td>
                  <td className={styles.td} style={{ color: '#3D3126' }}>{u.registered}</td>
                  <td className={styles.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span className={styles.actionBtn} title="View"><Icon name="eye" size={15} color="#6A5C42" /></span>
                      <span className={styles.actionBtn} title="Edit"><Icon name="edit" size={15} color="#6A5C42" /></span>
                      <span className={styles.actionBtn} title="Suspend"><Icon name="ban" size={15} color={C.warning} /></span>
                      <span className={styles.actionBtnDanger} title="Delete"><Icon name="trash-2" size={15} color={C.danger} /></span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
