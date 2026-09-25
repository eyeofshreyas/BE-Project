/** Admin console "Firm Analytics" tab: total claim-value exposure across pending cases
 * (five filters: Case, Client, Case Type, Lawyer, Status) and a per-lawyer workload table
 * with a same-day multi-case hearing-conflict indicator. Loads once from
 * `getFirmAnalytics()`; every filter/sum below is client-side, the same pattern
 * `ReportsView.tsx` uses over its own array. Clicking a workload row opens a detail panel
 * for that lawyer, the same modal-overlay pattern `UsersView.tsx`'s row actions use. ADMIN
 * only -- see AdminConsolePage.tsx's `adminOnly` nav filter. */
import { useEffect, useState } from 'react'
import { Icon } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { getFirmAnalytics } from '../../../api/client'
import { formatCompactINR } from '../../../utils/money'
import type { FirmAnalytics, FirmAnalyticsCase, LawyerWorkload } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const ALL = 'All'

const CASE_STATUS_COLORS: Record<string, string> = {
  Open: C.success, 'In Progress': C.warning, Pending: C.warning, Closed: '#8C857A',
}

const FILTER_LABEL = {
  fontSize: 9.5,
  fontWeight: 700,
  color: '#6E6759',
  fontFamily: "'IBM Plex Mono',monospace",
  textTransform: 'uppercase' as const,
  letterSpacing: '.12em',
  marginBottom: 6,
}

const SELECT_STYLE = {
  background: '#F6F2E9',
  border: `1.5px solid ${C.border}`,
  borderRadius: 3,
  padding: '9px 12px',
  fontSize: 13,
  color: C.text,
  fontFamily: "'Public Sans',sans-serif",
  outline: 'none',
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))].sort()
}

/** Renders the exposure card and the workload table. Loads `getFirmAnalytics()` on mount. */
export default function FirmAnalyticsView() {
  const [data, setData] = useState<FirmAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [caseFilter, setCaseFilter] = useState(ALL)
  const [clientFilter, setClientFilter] = useState(ALL)
  const [caseTypeFilter, setCaseTypeFilter] = useState(ALL)
  const [lawyerFilter, setLawyerFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [lawyerSearch, setLawyerSearch] = useState('')
  const [selectedLawyer, setSelectedLawyer] = useState<LawyerWorkload | null>(null)

  useEffect(() => {
    getFirmAnalytics().then(setData).catch((e: Error) => setError(e.message))
  }, [])

  if (error) {
    return <div style={{ background: '#FCFAF4', border: `1px solid ${C.danger}`, borderRadius: 3, padding: '12px 16px', fontSize: 13, color: C.danger }}>{error}</div>
  }
  if (!data) {
    return <div style={{ fontSize: 13, color: C.muted }}>Loading firm analytics…</div>
  }

  const cases = data.cases
  const caseTitles = distinct(cases.map((c) => c.case_title))
  const clients = distinct(cases.map((c) => c.client))
  const caseTypes = distinct(cases.map((c) => c.case_type))
  const lawyers = distinct(cases.flatMap((c) => c.lawyers))
  const statuses = distinct(cases.map((c) => c.status))

  function matchesFilters(c: FirmAnalyticsCase): boolean {
    if (caseFilter !== ALL && c.case_title !== caseFilter) return false
    if (clientFilter !== ALL && c.client !== clientFilter) return false
    if (caseTypeFilter !== ALL && c.case_type !== caseTypeFilter) return false
    if (lawyerFilter !== ALL && !c.lawyers.includes(lawyerFilter)) return false
    if (statusFilter !== ALL && c.status !== statusFilter) return false
    return true
  }

  const filtered = cases.filter(matchesFilters)

  // "Pending" is the default view (no explicit Status chosen): Closed cases are excluded
  // from the total. Picking a specific status -- including Closed itself -- shows that
  // status's real total instead of always forcing it to zero.
  const exposureRows = statusFilter === ALL ? filtered.filter((c) => c.status !== 'Closed') : filtered
  const totalExposure = exposureRows.reduce((sum, c) => sum + (c.claim_value ?? 0), 0)

  const visibleWorkload = data.workload.filter((w) => w.lawyer_name.toLowerCase().includes(lawyerSearch.toLowerCase()))

  // The detail panel shows this lawyer's full caseload, independent of the exposure card's
  // filters above -- it's a lookup by lawyer_id into the same payload, not a second fetch.
  const selectedLawyerCases = selectedLawyer ? cases.filter((c) => c.lawyer_ids.includes(selectedLawyer.lawyer_id)) : []

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Firm Analytics</div>
        <div className={styles.pageSubtitle}>Litigation exposure and counsel workload across your firm.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Financial Risk Exposure</div>
        <div style={{ fontSize: 12, color: '#6E6759', marginBottom: 16 }}>
          Total claim value across {statusFilter === ALL ? 'pending' : statusFilter.toLowerCase()} matters where a claim value is recorded
        </div>

        <div style={{ fontFamily: "'Spectral',serif", fontSize: 32, fontWeight: 700, color: '#1A1A17', marginBottom: 18 }}>
          {formatCompactINR(totalExposure)}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={FILTER_LABEL}>Case</div>
            <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} style={SELECT_STYLE}>
              <option value={ALL}>All Cases</option>
              {caseTitles.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={FILTER_LABEL}>Client</div>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={SELECT_STYLE}>
              <option value={ALL}>All Clients</option>
              {clients.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={FILTER_LABEL}>Case Type</div>
            <select value={caseTypeFilter} onChange={(e) => setCaseTypeFilter(e.target.value)} style={SELECT_STYLE}>
              <option value={ALL}>All Case Types</option>
              {caseTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={FILTER_LABEL}>Lawyer</div>
            <select value={lawyerFilter} onChange={(e) => setLawyerFilter(e.target.value)} style={SELECT_STYLE}>
              <option value={ALL}>All Lawyers</option>
              {lawyers.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <div style={FILTER_LABEL}>Status</div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={SELECT_STYLE}>
              <option value={ALL}>All Statuses</option>
              {statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.pageHeadRow} style={{ marginBottom: 14 }}>
          <div className={styles.sectionTitle}>Counsel Workload</div>
          <input
            placeholder="Filter by lawyer name..."
            value={lawyerSearch}
            onChange={(e) => setLawyerSearch(e.target.value)}
            style={{ ...SELECT_STYLE, width: 220 }}
          />
        </div>

        <div className={styles.card}>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Lawyer</th>
                  <th className={styles.th}>Active Cases</th>
                  <th className={styles.th}>Upcoming Hearings</th>
                  <th className={styles.th}>Conflicts</th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkload.length === 0 && (
                  <tr><td className={styles.td} colSpan={4} style={{ color: C.muted }}>No lawyers match this filter.</td></tr>
                )}
                {visibleWorkload.map((w) => (
                  <tr key={w.lawyer_id} className={styles.tr} style={{ cursor: 'pointer' }} onClick={() => setSelectedLawyer(w)}>
                    <td className={styles.td} style={{ fontWeight: 600, color: '#1A1A17' }}>{w.lawyer_name}</td>
                    <td className={styles.td}>{w.active_cases}</td>
                    <td className={styles.td}>{w.upcoming_hearings}</td>
                    <td className={styles.td}>
                      {w.conflict_dates.length > 0 ? (
                        <span className={styles.pill} style={pillStyle(C.warning)} title={`Double-booked on: ${w.conflict_dates.join(', ')}`}>
                          <Icon name="alert-triangle" size={12} color={C.warning} /> {w.conflict_dates.length} conflict{w.conflict_dates.length > 1 ? 's' : ''}
                        </span>
                      ) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedLawyer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(35, 48, 107,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={() => setSelectedLawyer(null)}>
          <div style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 28, width: 'min(560px,100%)', maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Spectral',serif", fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{selectedLawyer.lawyer_name}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>Counsel workload detail</div>
              </div>
              <span className={styles.actionBtn} onClick={() => setSelectedLawyer(null)} title="Close"><Icon name="x" size={15} color="#6E6759" /></span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={FILTER_LABEL}>Active Cases</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{selectedLawyer.active_cases}</div>
              </div>
              <div>
                <div style={FILTER_LABEL}>Upcoming Hearings</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{selectedLawyer.upcoming_hearings}</div>
              </div>
            </div>

            {selectedLawyer.conflict_dates.length > 0 && (
              <div style={{ background: '#FCF3E4', border: `1px solid ${C.warning}`, borderRadius: 3, padding: '10px 14px', fontSize: 12.5, color: '#6B4E1E', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alert-triangle" size={14} color={C.warning} />
                Double-booked on: {selectedLawyer.conflict_dates.join(', ')}
              </div>
            )}

            <div>
              <div style={FILTER_LABEL}>Cases ({selectedLawyerCases.length})</div>
              {selectedLawyerCases.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>No cases on record.</div>}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {selectedLawyerCases.map((c, i) => (
                  <div
                    key={c.case_id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '10px 0', borderBottom: i === selectedLawyerCases.length - 1 ? 'none' : '1px solid #F1EDE0' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1A1A17' }}>{c.case_title ?? 'Untitled matter'}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{c.client ?? '—'} · {c.case_type ?? '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className={styles.pill} style={pillStyle(CASE_STATUS_COLORS[c.status] ?? C.muted)}>{c.status}</span>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{c.claim_value != null ? formatCompactINR(c.claim_value) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
