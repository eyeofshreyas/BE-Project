import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, listHearings, listClients, listInvoices, listDocuments } from '../../api/client'
import type { CaseSummary, HearingSummary, ClientSummary, InvoiceSummary, DocumentSummary, UserProfile } from '../../types/api'
import { Icon } from '../../components/icons'
import styles from '../conveyancing/ConveyancingDashboardPage.module.css'

const MUTED = '#8C7C5E'
const PRIMARY_DARK = '#8f6743'
const CLOSED_STATUSES = new Set(['Closed', 'Completed'])
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function formatLakh(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString()}`
}

function dateBadge(iso: string) {
  const d = new Date(iso)
  return { day: String(d.getDate()).padStart(2, '0'), month: MONTH_LABELS[d.getMonth()].toUpperCase() }
}

export default function LawyerDashboardPage() {
  const navigate = useNavigate()
  const profile = loadProfile()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [hearings, setHearings] = useState<HearingSummary[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listCases(), listHearings(), listClients(), listInvoices(), listDocuments()])
      .then(([c, h, cl, inv, docs]) => { setCases(c); setHearings(h); setClients(cl); setInvoices(inv); setDocuments(docs) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  const firstName = profile?.full_name.split(' ')[0] ?? 'there'
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  const activeCases = cases.filter((c) => !CLOSED_STATUSES.has(c.status))
  const weekAheadMs = Date.now() + 7 * 86400000
  const pendingHearingsThisWeek = hearings.filter((h) => h.hearing_status === 'Scheduled' && new Date(h.hearing_date).getTime() <= weekAheadMs && new Date(h.hearing_date).getTime() >= Date.now())
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const aiSummaryCount = documents.filter((d) => d.has_summary).length

  const now0 = new Date()
  const isThisMonth = (raw: string | null | undefined) => {
    if (!raw) return false
    const d = new Date(raw)
    return d.getFullYear() === now0.getFullYear() && d.getMonth() === now0.getMonth()
  }
  const casesThisMonth = cases.filter((c) => isThisMonth(c.filing_date ?? c.created_at)).length
  const activeCasesThisMonth = activeCases.filter((c) => isThisMonth(c.filing_date ?? c.created_at)).length
  const activeClientsCount = clients.filter((c) => c.status === 'Active').length
  const aiSummariesThisMonth = documents.filter((d) => d.has_summary && isThisMonth(d.upload_date)).length

  const invoicedThisMonth = invoices.filter((i) => isThisMonth(i.issue_date)).reduce((sum, i) => sum + i.total_amount, 0)
  const invoicedLastMonth = invoices
    .filter((i) => {
      const d = new Date(i.issue_date)
      const lastMonth = new Date(now0.getFullYear(), now0.getMonth() - 1, 1)
      return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth()
    })
    .reduce((sum, i) => sum + i.total_amount, 0)
  const invoicePctChange = invoicedLastMonth > 0 ? Math.round(((invoicedThisMonth - invoicedLastMonth) / invoicedLastMonth) * 100) : null

  const statCards = [
    { label: 'Total Cases', value: String(cases.length), pill: `+${casesThisMonth} this mo`, icon: 'briefcase' as const },
    { label: 'Active Cases', value: String(activeCases.length), pill: `+${activeCasesThisMonth} this mo`, icon: 'bar-chart-2' as const },
    { label: 'Pending Hearings', value: String(pendingHearingsThisWeek.length), pill: 'This week', icon: 'calendar' as const },
    { label: 'Total Clients', value: String(clients.length), pill: `${activeClientsCount} active`, icon: 'users' as const },
    { label: 'Invoices Generated', value: formatLakh(totalInvoiced), pill: invoicePctChange !== null ? `${invoicePctChange >= 0 ? '+' : ''}${invoicePctChange}%` : null, icon: 'receipt' as const },
    { label: 'AI Summaries', value: String(aiSummaryCount), pill: `+${aiSummariesThisMonth} this mo`, icon: 'sparkles' as const },
  ]

  // Monthly "cases filed" histogram for the last 12 months, using filing_date
  // (falls back to created_at for cases without a formal filing date -- e.g.
  // engagements created via an accepted client request).
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const monthCounts = months.map(({ year, month }) =>
    cases.filter((c) => {
      const raw = c.filing_date ?? c.created_at
      if (!raw) return false
      const d = new Date(raw)
      return d.getFullYear() === year && d.getMonth() === month
    }).length
  )
  const maxCount = Math.max(1, ...monthCounts)
  const currentCount = monthCounts[11]
  const previousCount = monthCounts[10]
  const pctChange = previousCount > 0 ? Math.round(((currentCount - previousCount) / previousCount) * 100) : null

  const upcomingHearings = [...hearings]
    .filter((h) => h.hearing_status === 'Scheduled')
    .sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))
    .slice(0, 5)

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Welcome back, {firstName}</div>
            <div className={styles.subtitle}>Here's what's happening across your cases today, {todayLabel}.</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.primaryChip} onClick={() => navigate('/cases/new')}><Icon name="plus" size={15} color="#FFFFFF" /> New Case</div>
            <div className={styles.ghostChip} onClick={() => navigate('/documents')}><Icon name="file-text" size={15} color="#2A2118" /> Upload Document</div>
            <div className={styles.ghostChip} style={{ opacity: .5, cursor: 'default' }} title="Hearing scheduling coming soon"><Icon name="calendar" size={15} color="#2A2118" /> Schedule Hearing</div>
          </div>
        </div>

        {loading && <div style={{ padding: '24px 4px', color: MUTED, fontSize: 13.5 }}>Loading your dashboard…</div>}
        {error && <div style={{ padding: '24px 4px', color: '#B05C5C', fontSize: 13.5 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.statCards}>
              {statCards.map((s) => (
                <div key={s.label} className={styles.statCard} style={{ gap: 8 }}>
                  <div className={styles.statIconRow}>
                    <div className={styles.statIconWrap}><Icon name={s.icon} size={19} color={PRIMARY_DARK} /></div>
                    {s.pill && <span className={styles.statusBadge} style={{ background: '#EFE4CB', color: PRIMARY_DARK }}>{s.pill}</span>}
                  </div>
                  <div>
                    <div className={styles.statValue}>{s.value}</div>
                    <div className={styles.statLabel} style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700, letterSpacing: '.03em' }}>{s.label}</div>
                  </div>
                  <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: '100%' }} /></div>
                </div>
              ))}
            </div>

            <div className={styles.panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className={styles.statIconWrap}><Icon name="bar-chart-2" size={18} color={PRIMARY_DARK} /></div>
                  <div>
                    <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Case Analytics</div>
                    <div style={{ fontSize: 12, color: MUTED }}>New cases filed, last 12 months</div>
                  </div>
                </div>
                {pctChange !== null && (
                  <span className={styles.statusBadge} style={pctChange >= 0 ? { color: '#2E9E58', background: '#E4F5EA' } : { color: '#B05C5C', background: '#FBEAEA' }}>
                    {pctChange >= 0 ? '↗' : '↘'} {pctChange >= 0 ? '+' : ''}{pctChange}% vs last period
                  </span>
                )}
              </div>
              <div className={styles.barChartArea}>
                {months.map(({ month }, i) => {
                  const count = monthCounts[i]
                  const isCurrent = i === 11
                  const heightPct = Math.max(4, (count / maxCount) * 100)
                  return (
                    <div key={i} className={styles.barCol}>
                      {isCurrent && count > 0 && <span className={styles.barValueBadge}>{count}</span>}
                      <div className={styles.bar} style={{ height: `${heightPct}%`, background: isCurrent ? PRIMARY_DARK : '#D8C79A' }} title={`${count} case${count === 1 ? '' : 's'}`} />
                      <div className={styles.barMonthLabel}>{MONTH_LABELS[month]}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Upcoming Hearings</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcomingHearings.map((h) => {
                  const badge = dateBadge(h.hearing_date)
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: '1px solid #F1E9D9', cursor: 'pointer' }} onClick={() => navigate(`/cases/${h.case_id}`)}>
                      <div style={{ width: 50, height: 50, borderRadius: 10, background: '#F5EFDF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2118', lineHeight: 1.1 }}>{badge.day}</div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8C7C5E' }}>{badge.month}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2A2118' }}>{h.case_title ?? h.case_number ?? 'Hearing'}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{h.court_name ?? 'Court TBD'} · {h.hearing_time?.slice(0, 5) ?? '—'}</div>
                      </div>
                      <span className={styles.statusBadge} style={{ color: PRIMARY_DARK, background: '#EFE4CB', flexShrink: 0 }}>Hearing</span>
                    </div>
                  )
                })}
                {upcomingHearings.length === 0 && (
                  <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No upcoming hearings.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
