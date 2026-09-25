/** Admin console "Firm Analytics" tab: total claim-value exposure across pending cases
 * (five filters: Case, Client, Case Type, Lawyer, Status) and a per-lawyer workload table
 * with a same-day multi-case hearing-conflict indicator. Loads once from
 * `getFirmAnalytics()`; every filter/sum below is client-side, the same pattern
 * `ReportsView.tsx` uses over its own array. ADMIN only -- see AdminConsolePage.tsx's
 * `adminOnly` nav filter. */
import { useEffect, useState } from 'react'
import { Icon } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { getFirmAnalytics } from '../../../api/client'
import { formatCompactINR } from '../../../utils/money'
import type { FirmAnalytics, FirmAnalyticsCase } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const ALL = 'All'

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

        <div className={styles.card} style={{ padding: 0 }}>
          {visibleWorkload.length === 0 && (
            <div style={{ padding: '24px 22px', fontSize: 13.5, color: C.muted }}>No lawyers match this filter.</div>
          )}

          {visibleWorkload.map((w, i) => (
            <div
              key={w.lawyer_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px 22px',
                borderBottom: i === visibleWorkload.length - 1 ? 'none' : '1px solid #F1EDE0',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#1A1A17' }}>{w.lawyer_name}</div>
              <div style={{ fontSize: 12.5, color: '#6E6759', width: 130 }}>
                Active cases <span style={{ fontWeight: 700, color: '#1A1A17' }}>{w.active_cases}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#6E6759', width: 160 }}>
                Upcoming hearings <span style={{ fontWeight: 700, color: '#1A1A17' }}>{w.upcoming_hearings}</span>
              </div>
              {w.conflict_dates.length > 0 && (
                <span
                  className={styles.pill}
                  style={pillStyle(C.warning)}
                  title={`Double-booked on: ${w.conflict_dates.join(', ')}`}
                >
                  <Icon name="alert-triangle" size={12} color={C.warning} /> {w.conflict_dates.length} conflict{w.conflict_dates.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
