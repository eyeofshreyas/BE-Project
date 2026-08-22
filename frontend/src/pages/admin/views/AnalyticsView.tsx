import { Icon, type IconName } from '../icons'
import { C, pillStyle } from '../theme'
import styles from '../adminShared.module.css'

const DONUT_SLICES = [
  { label: 'Active', pct: 45, color: C.primary },
  { label: 'Pending', pct: 25, color: C.warning },
  { label: 'Closed', pct: 20, color: C.success },
  { label: 'On Hold', pct: 10, color: C.danger },
]

let donutAcc = 0
const donutStops = DONUT_SLICES.map((s) => {
  const start = donutAcc
  donutAcc += s.pct
  return `${s.color} ${start}% ${donutAcc}%`
}).join(', ')

const GROWTH_MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
const GROWTH_VALS = [86, 102, 95, 128, 140, 161]
const GROWTH_MAX = Math.max(...GROWTH_VALS)

const AI_VALS = [120, 180, 150, 240, 300, 280, 360, 410]
const AI_MAX = Math.max(...AI_VALS)
const AI_MIN = Math.min(...AI_VALS)
const AI_RANGE = AI_MAX - AI_MIN || 1
const CHART_W = 300
const CHART_H = 140
const CHART_PAD = 8
const aiPoints = AI_VALS.map((v, i) => ({
  x: (i / (AI_VALS.length - 1)) * (CHART_W - 2 * CHART_PAD) + CHART_PAD,
  y: CHART_H - CHART_PAD - ((v - AI_MIN) / AI_RANGE) * (CHART_H - 2 * CHART_PAD),
}))
const aiLinePoints = aiPoints.map((p) => `${p.x},${p.y}`).join(' ')
const aiAreaPoints = `${aiLinePoints} ${CHART_W - CHART_PAD},${CHART_H - CHART_PAD} ${CHART_PAD},${CHART_H - CHART_PAD}`

const DOC_INSIGHTS: { label: string; value: string; icon: IconName; color: string }[] = [
  { label: 'Total Documents', value: '18,540', icon: 'file-text', color: C.primaryDark },
  { label: 'Processing', value: '42', icon: 'sparkles', color: C.warning },
  { label: 'AI Completed', value: '18,214', icon: 'check-circle', color: C.success },
  { label: 'Failed Uploads', value: '284', icon: 'alert-triangle', color: C.danger },
]

const AI_STATUS: { label: string; status: 'Healthy' | 'Warning'; uptime: string; lastChecked: string; icon: IconName }[] = [
  { label: 'AI Document Summarizer', status: 'Healthy', uptime: '99.98%', lastChecked: '2 min ago', icon: 'sparkles' },
  { label: 'Similar Case Search', status: 'Healthy', uptime: '99.95%', lastChecked: '2 min ago', icon: 'search' },
  { label: 'Translation Service', status: 'Warning', uptime: '97.20%', lastChecked: '5 min ago', icon: 'file-text' },
  { label: 'Database', status: 'Healthy', uptime: '99.99%', lastChecked: '1 min ago', icon: 'database' },
  { label: 'Server', status: 'Healthy', uptime: '99.97%', lastChecked: '1 min ago', icon: 'server' },
  { label: 'Storage', status: 'Warning', uptime: '98.40%', lastChecked: '4 min ago', icon: 'hard-drive' },
]

const STATUS_COLOR = { Healthy: C.success, Warning: C.warning }

export default function AnalyticsView() {
  return (
    <>
      <div>
        <div className={styles.pageTitle}>Analytics</div>
        <div className={styles.pageSubtitle}>Case distribution, filing growth, AI workload and platform service health.</div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>System Analytics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 20, alignItems: 'stretch' }}>
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Case Status</div>
            <div style={{ fontSize: 12, color: '#8C7C5E', marginBottom: 16 }}>Distribution across all cases</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 150, height: 150, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${donutStops})` }}>
                <div style={{ width: 92, height: 92, background: '#FFFFFF', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2A2118', fontFamily: "'Poppins',sans-serif", lineHeight: 1 }}>1,204</div>
                  <div style={{ fontSize: 10.5, color: '#8C7C5E', marginTop: 2 }}>total cases</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {DONUT_SLICES.map((d) => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3D3126' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} /><span style={{ flex: 1 }}>{d.label}</span><span style={{ fontWeight: 600, color: '#8C7C5E' }}>{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Monthly Case Growth</div>
            <div style={{ fontSize: 12, color: '#8C7C5E', marginBottom: 18 }}>New cases filed, last 6 months</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 150, padding: '0 4px' }}>
              {GROWTH_VALS.map((v, i) => (
                <div key={GROWTH_MONTHS[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#8C7C5E', fontWeight: 600 }}>{v}</div>
                  <div style={{ width: '60%', maxWidth: 34, height: `${(v / GROWTH_MAX) * 110}px`, borderRadius: '8px 8px 3px 3px', background: 'linear-gradient(180deg,#C9A47C,#B08D3E)' }} />
                  <div style={{ fontSize: 11.5, color: '#8C7C5E', fontWeight: 500 }}>{GROWTH_MONTHS[i]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>AI Usage Trend</div>
            <div style={{ fontSize: 12, color: '#8C7C5E', marginBottom: 14 }}>AI summaries generated, last 8 weeks</div>
            <svg viewBox="0 0 300 140" width="100%" height={150} preserveAspectRatio="none">
              <polygon points={aiAreaPoints} fill={C.primary} opacity={0.12} />
              <polyline points={aiLinePoints} fill="none" stroke={C.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {aiPoints.map((p) => <circle key={p.x} cx={p.x} cy={p.y} r={3} fill={C.primary} />)}
            </svg>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>Document Insights</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
          {DOC_INSIGHTS.map((d) => (
            <div key={d.label} style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: d.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={d.icon} size={17} color={d.color} /></div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 21, fontWeight: 700, color: '#2A2118' }}>{d.value}</div>
              <div style={{ fontSize: 12, color: '#8C7C5E', fontWeight: 500 }}>{d.label}</div>
            </div>
          ))}
        </div>
        <div className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2118' }}>Storage Usage</div>
            <div style={{ fontSize: 12.5, color: '#8C7C5E' }}>340 GB of 500 GB used</div>
          </div>
          <div style={{ height: 10, background: '#EFE4CB', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: '68%', height: '100%', background: 'linear-gradient(90deg,#B08D3E,#D8C79A)', borderRadius: 6 }} /></div>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>AI System Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {AI_STATUS.map((s) => (
            <div key={s.label} style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={16} color={C.primaryDark} /></div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2118' }}>{s.label}</div>
                </div>
                <span className={styles.pill} style={pillStyle(STATUS_COLOR[s.status])}>{s.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8C7C5E' }}><span>Uptime</span><span style={{ fontWeight: 600, color: '#3D3126' }}>{s.uptime}</span></div>
              <div style={{ fontSize: 11, color: '#A38F66' }}>Last checked {s.lastChecked}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
