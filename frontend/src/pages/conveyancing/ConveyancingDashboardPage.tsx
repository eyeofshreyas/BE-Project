import { useState } from 'react'
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
const MapPinIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx={12} cy={10} r={3} /></svg>
const LinkIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
const BanknoteIcon = () => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={6} width={20} height={12} rx={2} /><circle cx={12} cy={12} r={2} /><path d="M6 12h.01M18 12h.01" /></svg>

const STAT_CARDS = [
  { label: 'Active Matters', value: '24', icon: <BriefcaseIcon /> },
  { label: 'Pending Reg.', value: '8', icon: <ClockIcon /> },
  { label: 'Completed Reg.', value: '142', icon: <CheckCircleIcon /> },
  { label: 'Upcoming Appts', value: '5', icon: <CalendarIcon /> },
]

const STATUS_SLICES = [
  { label: 'Drafting', pct: 45, color: PRIMARY },
  { label: 'Pending', pct: 30, color: '#D9822B' },
  { label: 'Lodged', pct: 25, color: '#4CAF50' },
]

const STATUS_STYLE_MAP: Record<string, [string, string]> = {
  'Documents Pending': ['#B87F1E', '#FFF2E0'],
  Drafting: ['#6A5C42', '#EFEAE1'],
  Lodged: ['#2E9E58', '#E4F5EA'],
}

const MATTERS = [
  { num: 'MAT-2023-089', client: 'Smith, J. & E.', type: 'Residential Sale', status: 'Documents Pending' },
  { num: 'MAT-2023-092', client: 'Acme Corp Ltd.', type: 'Commercial Lease', status: 'Drafting' },
  { num: 'MAT-2023-104', client: 'Williams, T.', type: 'Residential Purchase', status: 'Lodged' },
  { num: 'MAT-2023-108', client: 'Chen, L.', type: 'Off-the-Plan Purchase', status: 'Drafting' },
]

const QUICK_ACTIONS = ['Schedule Registration', 'Upload Documents', 'Request Settlement Funds']

const APPOINTMENTS = [
  { time: 'Today, 2:00 PM', title: 'Smith Residential Sale', meta: 'Titles Office', icon: <MapPinIcon />, active: true },
  { time: 'Tomorrow, 10:30 AM', title: 'Acme Corp Lease Execution', meta: 'Zoom Meeting', icon: <LinkIcon />, active: false },
  { time: 'Oct 26, 9:00 AM', title: 'Williams Purchase Settlement', meta: 'Bank Branch', icon: <BanknoteIcon />, active: false },
]

let donutAcc = 0
const donutStops = STATUS_SLICES.map((s) => {
  const start = donutAcc
  donutAcc += s.pct
  return `${s.color} ${start}% ${donutAcc}%`
}).join(', ')

export default function ConveyancingDashboardPage() {
  const [toast, setToast] = useState<string | null>(null)

  function fireAction(label: string) {
    setToast(`${label}…`)
    setTimeout(() => setToast(null), 1800)
  }

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

        <div className={styles.topGrid}>
          <div className={styles.statCards}>
            {STAT_CARDS.map((s) => (
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
                <div className={styles.donutTotal}>32</div>
                <div className={styles.donutTotalLabel}>Total</div>
              </div>
            </div>
            <div className={styles.legendCol}>
              <div className={styles.legendTitle}>Status Breakdown</div>
              <div className={styles.legendList}>
                {STATUS_SLICES.map((s) => (
                  <div key={s.label} className={styles.legendRow}><span className={styles.legendDot} style={{ background: s.color }} />{s.label}</div>
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
                {MATTERS.map((m) => {
                  const [color, bg] = STATUS_STYLE_MAP[m.status] || STATUS_STYLE_MAP.Drafting
                  return (
                    <tr key={m.num} className={styles.tr}>
                      <td className={styles.tdMono}>{m.num}</td>
                      <td className={styles.tdClient}>{m.client}</td>
                      <td className={styles.td}>{m.type}</td>
                      <td className={styles.td}><span className={styles.statusBadge} style={{ color, background: bg }}>{m.status}</span></td>
                    </tr>
                  )
                })}
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
            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Upcoming Appointments</div>
              <div className={styles.timeline}>
                {APPOINTMENTS.map((a) => (
                  <div key={a.title} className={styles.timelineItem}>
                    <div className={styles.timelineDot} style={{ background: a.active ? PRIMARY : '#FFFFFF', border: `2px solid ${a.active ? PRIMARY : '#E7DCC6'}` }} />
                    <div className={styles.timelineTime} style={{ color: a.active ? PRIMARY_DARK : '#2A2118' }}>{a.time}</div>
                    <div className={styles.timelineTitle}>{a.title}</div>
                    <div className={styles.timelineMeta}>{a.icon}{a.meta}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  )
}
