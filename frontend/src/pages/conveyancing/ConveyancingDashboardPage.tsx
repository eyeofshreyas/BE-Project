import { useEffect, useState } from 'react'
import { getConveyancingSummary } from '../../api/client'
import type { ConveyancingSummary } from '../../types/api'
import styles from './ConveyancingDashboardPage.module.css'

const PRIMARY = '#B08D3E'
const PRIMARY_DARK = '#8f6743'
const MUTED = '#8C7C5E'

const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: PRIMARY_DARK, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const BriefcaseIcon = () => <svg {...iconProps}><rect x={2} y={7} width={20} height={14} rx={2} /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
const ClockIcon = () => <svg {...iconProps}><circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" /></svg>
const CheckCircleIcon = () => <svg {...iconProps}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
const CalendarIcon = () => <svg {...iconProps}><rect x={3} y={4} width={18} height={18} rx={2} /><line x1={16} y1={2} x2={16} y2={6} /><line x1={8} y1={2} x2={8} y2={6} /><line x1={3} y1={10} x2={21} y2={10} /></svg>
const FilterIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
const PlusIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1={12} y1={5} x2={12} y2={19} /><line x1={5} y1={12} x2={19} y2={12} /></svg>
const ChevronRightIcon = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>

const DONUT_COLORS = [PRIMARY, '#D9822B', '#4CAF50', '#5C8AB0', '#9E5CB0', '#B05C5C']

const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  'Documents Pending': ['#B87F1E', '#FFF2E0'],
  Drafting: ['#6A5C42', '#EFEAE1'],
  Lodged: ['#2E9E58', '#E4F5EA'],
  Completed: ['#2E9E58', '#E4F5EA'],
  Registered: ['#2E9E58', '#E4F5EA'],
  'In Progress': ['#B87F1E', '#FFF2E0'],
  'Registration Scheduled': ['#6A5C42', '#EFEAE1'],
  Pending: ['#B87F1E', '#FFF2E0'],
}
const DEFAULT_STATUS_STYLE: [string, string] = ['#6A5C42', '#EFEAE1']

const QUICK_ACTIONS = ['Schedule Registration', 'Upload Documents', 'Request Settlement Funds']

export default function ConveyancingDashboardPage() {
  const [toast, setToast] = useState<string | null>(null)
  const [summary, setSummary] = useState<ConveyancingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getConveyancingSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load conveyancing data.'))
      .finally(() => setLoading(false))
  }, [])

  function fireAction(label: string) {
    setToast(`${label}…`)
    setTimeout(() => setToast(null), 1800)
  }

  const total = summary?.status_breakdown.reduce((sum, s) => sum + s.count, 0) ?? 0
  let donutAcc = 0
  const donutStops = summary && total > 0
    ? summary.status_breakdown.map((s, i) => {
        const pct = (s.count / total) * 100
        const start = donutAcc
        donutAcc += pct
        return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${donutAcc}%`
      }).join(', ')
    : '#E7DCC6 0% 100%'

  const statCards = summary ? [
    { label: 'Active Matters', value: String(summary.stats.active_matters), icon: <BriefcaseIcon /> },
    { label: 'Pending Reg.', value: String(summary.stats.pending_registrations), icon: <ClockIcon /> },
    { label: 'Completed Reg.', value: String(summary.stats.completed_registrations), icon: <CheckCircleIcon /> },
    { label: 'Upcoming Appts', value: String(summary.stats.upcoming_appointments), icon: <CalendarIcon /> },
  ] : []

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Conveyancing Dashboard</div>
            <div className={styles.subtitle}>Today's conveyancing metrics and critical tasks.</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.ghostChip}><FilterIcon /><span>Filter</span></div>
            <div className={styles.primaryChip}><PlusIcon /><span>New Matter</span></div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading conveyancing data…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {summary && (
          <>
            <div className={styles.topGrid}>
              <div className={styles.statCards}>
                {statCards.map((s) => (
                  <div key={s.label} className={styles.statCard}>
                    <div className={styles.statIconRow}><div className={styles.statIconWrap}>{s.icon}</div></div>
                    <div>
                      <div className={styles.statValue}>{s.value}</div>
                      <div className={styles.statLabel}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.donutCard}>
                <div className={styles.donut} style={{ background: `conic-gradient(${donutStops})` }}>
                  <div className={styles.donutHole}>
                    <div className={styles.donutTotal}>{total}</div>
                    <div className={styles.donutTotalLabel}>Total</div>
                  </div>
                </div>
                <div className={styles.legendCol}>
                  <div className={styles.legendTitle}>Status Breakdown</div>
                  <div className={styles.legendList}>
                    {summary.status_breakdown.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No matters yet.</div>}
                    {summary.status_breakdown.map((s, i) => (
                      <div key={s.label} className={styles.legendRow}><span className={styles.legendDot} style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{s.label} ({s.count})</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.midGrid}>
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <div className={styles.tableHeadTitle}>Recent Conveyancing Matters</div>
                  <span className={styles.viewAll}>View All</span>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Matter Number</th>
                      <th className={styles.th}>Client</th>
                      <th className={styles.th}>Matter Type</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent_matters.map((m) => {
                      const [color, bg] = STATUS_STYLE_MAP[m.status] || DEFAULT_STATUS_STYLE
                      return (
                        <tr key={m.number} className={styles.tr}>
                          <td className={styles.tdMono}>{m.number}</td>
                          <td className={styles.tdClient}>{m.client ?? '—'}</td>
                          <td className={styles.td}>{m.type}</td>
                          <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{m.status}</span></td>
                        </tr>
                      )
                    })}
                    {summary.recent_matters.length === 0 && (
                      <tr><td className={styles.td} colSpan={4} style={{ color: MUTED, textAlign: 'center', padding: '20px 0' }}>No conveyancing matters yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.sideCol}>
                <div className={styles.panelCard}>
                  <div className={styles.panelTitle}>Quick Actions</div>
                  <div className={styles.quickActionsList}>
                    {QUICK_ACTIONS.map((label) => (
                      <div key={label} className={styles.quickAction} onClick={() => fireAction(label)}>
                        <span>{label}</span><ChevronRightIcon />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}
