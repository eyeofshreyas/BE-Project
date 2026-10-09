/** Admin console "Conflicts" tab: multi-criteria conflict-of-interest search across the
 * firm's clients and case parties (`searchConflicts()`), with a derived status badge,
 * drill-down into the matching case, CSV export, and a persisted search-history audit
 * trail (`listConflictSearchHistory()`). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../../../components/theme'
import { searchConflicts, listConflictSearchHistory, listClients } from '../../../api/client'
import type { ConflictMatch, ConflictSearchHistoryEntry, ClientSummary } from '../../../types/api'
import { Icon } from '../../../components/icons'
import { formatDate } from '../../../utils/date'
import { downloadCsv } from '../../../utils/files'
import styles from '../../../components/AppShell.module.css'

const inputStyle = { padding: '9px 12px', borderRadius: 3, border: '1.5px solid #CFC6B0', fontSize: 13.5, flex: 1, minWidth: 160 }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)', display: 'flex', alignItems: 'center', gap: 6 }

type Status = 'clear' | 'review' | 'conflict'
const STATUS_STYLE: Record<Status, { label: string; color: string; bg: string }> = {
  clear: { label: 'Clear', color: '#4A6B4E', bg: '#E4EDE5' },
  review: { label: 'Needs Review', color: '#8A6A2F', bg: '#F3EBD9' },
  conflict: { label: 'Conflict', color: '#B3282D', bg: '#F7E4E5' },
}

/** A result is only a confident "Conflict" when the searched name exactly matches a hit --
 * a bare substring match (e.g. searching a case/client with no typed name) can't claim
 * that confidently, so it's downgraded to "Needs Review" for a human to confirm. */
function deriveStatus(results: ConflictMatch[], name: string): Status {
  if (results.length === 0) return 'clear'
  const exact = name.trim().toLowerCase()
  if (exact && results.some((r) => r.name.toLowerCase() === exact)) return 'conflict'
  return 'review'
}

export default function ConflictSearchView() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [results, setResults] = useState<ConflictMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'All' | 'client' | 'party'>('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [history, setHistory] = useState<ConflictSearchHistoryEntry[]>([])
  const [lastQueryName, setLastQueryName] = useState('')

  useEffect(() => {
    listClients().then(setClients).catch(() => {})
    refreshHistory()
  }, [])

  function refreshHistory() {
    listConflictSearchHistory().then(setHistory).catch(() => {})
  }

  async function search() {
    if (!name.trim() && !clientId && !caseNumber.trim()) return
    setSearching(true)
    setError('')
    try {
      const rows = await searchConflicts({
        name: name.trim() || undefined,
        clientId: clientId ? Number(clientId) : undefined,
        caseNumber: caseNumber.trim() || undefined,
      })
      setResults(rows)
      setLastQueryName(name.trim() || clients.find((c) => String(c.id) === clientId)?.full_name || '')
      setSourceFilter('All')
      setRoleFilter('All')
      refreshHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search.')
    } finally {
      setSearching(false)
    }
  }

  function rerun(entry: ConflictSearchHistoryEntry) {
    setName(entry.name ?? '')
    setClientId('')
    setCaseNumber(entry.case_number ?? '')
  }

  const roleOptions = ['All', ...new Set((results ?? []).map((r) => r.role).filter((r): r is string => !!r))]
  const filtered = (results ?? []).filter((r) =>
    (sourceFilter === 'All' || r.source === sourceFilter) && (roleFilter === 'All' || r.role === roleFilter)
  )
  const status = results !== null ? deriveStatus(results, lastQueryName) : null

  function exportResults() {
    downloadCsv(
      'conflict-search-results',
      ['Name', 'Found As', 'Case', 'Role', 'Lawyer'],
      filtered.map((m) => [m.name, m.source, m.case_number, m.role ?? '', m.lawyer ?? '']),
    )
  }

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Conflict Search</div>
        <div className={styles.pageSubtitle}>Search every client and case party in your firm by name, client, or matter.</div>
      </div>

      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search by name…"
            style={inputStyle}
          />
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...inputStyle, flex: '0 1 200px' }}>
            <option value="">Any client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <input
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Case / matter number…"
            style={{ ...inputStyle, flex: '0 1 200px' }}
          />
          <div style={{ ...BTN_PRIMARY, opacity: searching || (!name.trim() && !clientId && !caseNumber.trim()) ? 0.6 : 1 }} onClick={searching ? undefined : search}>
            <Icon name="search" size={15} color="#FCFAF4" /> {searching ? 'Searching…' : 'Search'}
          </div>
        </div>
        {error && <div style={{ marginTop: 12, color: C.danger, fontSize: 13.5 }}>{error}</div>}
      </div>

      {results !== null && status && (
        <div className={styles.card}>
          <div className={styles.cardHeadRow} style={{ flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.cardTitle}>Matches{results.length > 0 && ` (${filtered.length}/${results.length})`}</div>
              <span className={styles.pill} style={{ color: STATUS_STYLE[status].color, background: STATUS_STYLE[status].bg, fontWeight: 700 }}>{STATUS_STYLE[status].label}</span>
            </div>
            {results.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} style={{ padding: '6px 10px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 12.5 }}>
                  <option value="All">All sources</option>
                  <option value="client">Client</option>
                  <option value="party">Party</option>
                </select>
                {roleOptions.length > 1 && (
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 3, border: '1px solid #CFC6B0', fontSize: 12.5 }}>
                    {roleOptions.map((r) => <option key={r} value={r}>{r === 'All' ? 'All roles' : r}</option>)}
                  </select>
                )}
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={exportResults}>
                  <Icon name="download" size={13} color={C.primary} /> Export
                </div>
              </div>
            )}
          </div>
          {results.length === 0 ? (
            <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>No matches found -- clear to proceed.</div>
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
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={i} className={styles.tr} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${m.case_id}`)}>
                      <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{m.name}</td>
                      <td className={styles.td} style={{ color: '#33302A', textTransform: 'capitalize' }}>{m.source}</td>
                      <td className={styles.td} style={{ color: '#6E6759' }}>{m.case_number}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{m.role ?? '—'}</td>
                      <td className={styles.td} style={{ color: '#33302A' }}>{m.lawyer ?? '—'}</td>
                      <td className={styles.td} style={{ color: C.primary, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>View Details →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle}>Recent Searches</div>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: '24px 4px', color: C.muted, fontSize: 13.5 }}>No searches recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Query</th>
                  <th className={styles.th}>Case</th>
                  <th className={styles.th}>Results</th>
                  <th className={styles.th}>Searched By</th>
                  <th className={styles.th}>When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.search_id} className={styles.tr} style={{ cursor: 'pointer' }} onClick={() => rerun(h)} title="Click to re-run this search">
                    <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{h.name || '—'}</td>
                    <td className={styles.td} style={{ color: '#6E6759' }}>{h.case_number || '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{h.result_count}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{h.searched_by ?? '—'}</td>
                    <td className={styles.td} style={{ color: '#33302A' }}>{formatDate(h.created_at)}</td>
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
