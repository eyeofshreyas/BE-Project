/** Admin console "Conflicts" tab: name search across the firm's clients and case parties (`searchConflicts()`). */
import { useState } from 'react'
import { C } from '../../../components/theme'
import { searchConflicts } from '../../../api/client'
import type { ConflictMatch } from '../../../types/api'
import { Icon } from '../../../components/icons'
import styles from '../../../components/AppShell.module.css'

const inputStyle = { padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, flex: 1, minWidth: 0 }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)', display: 'flex', alignItems: 'center', gap: 6 }

export default function ConflictSearchView() {
  const [name, setName] = useState('')
  const [results, setResults] = useState<ConflictMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function search() {
    if (!name.trim()) return
    setSearching(true)
    setError('')
    try {
      setResults(await searchConflicts(name.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Conflict Search</div>
        <div className={styles.pageSubtitle}>Search every client and case party in your firm by name.</div>
      </div>

      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search by name…"
            style={inputStyle}
          />
          <div style={{ ...BTN_PRIMARY, opacity: searching || !name.trim() ? 0.6 : 1 }} onClick={searching || !name.trim() ? undefined : search}>
            <Icon name="search" size={15} color="#FCFAF4" /> {searching ? 'Searching…' : 'Search'}
          </div>
        </div>
        {error && <div style={{ marginTop: 12, color: C.danger, fontSize: 13.5 }}>{error}</div>}
      </div>

      {results !== null && (
        <div className={styles.card}>
          <div className={styles.cardHeadRow}>
            <div className={styles.cardTitle}>Matches{results.length > 0 && ` (${results.length})`}</div>
          </div>
          {results.length === 0 ? (
            <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>No matches found for "{name}".</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Found As</th>
                    <th className={styles.th}>Case</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>Lawyer</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((m, i) => (
                    <tr key={i} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{m.name}</td>
                      <td className={styles.td} style={{ color: '#33302A', textTransform: 'capitalize' }}>{m.source}</td>
                      <td className={styles.td} style={{ color: '#6E6759' }}>{m.case_number}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{m.role ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{m.lawyer ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
