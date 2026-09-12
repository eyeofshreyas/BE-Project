/** Admin console "Analytics" tab: case-status donut, monthly filing growth, AI-summary
 * usage trend, document insight cards and storage usage -- all from `getAdminAnalytics()`. */
import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C } from '../../../components/theme'
import { getAdminAnalytics } from '../../../api/client'
import type { AdminAnalytics } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

const STATUS_COLORS: Record<string, string> = {
  open: C.primary,
  'in progress': C.warning,
  closed: C.success,
  'on hold': C.danger,
}
// Statuses the backend grows later still get a distinct slice rather than all-grey.
const FALLBACK_COLORS = ['#6E6759', '#8C857A', '#4A6B4E', '#8A6A2F']

const CHART_W = 300
const CHART_H = 140
const CHART_PAD = 8

function statusColor(label: string, index: number) {
  return STATUS_COLORS[label.toLowerCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

/** "340 GB", "1.2 MB" -- whole-number GB/MB is all the storage bar needs. */
function formatBytes(bytes: number) {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`
  const mb = bytes / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** Renders the case-status donut, monthly growth bars, AI usage sparkline, document
 * insight cards and the storage bar. Loads everything from `/admin/analytics` on mount. */
export default function AnalyticsView() {
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAdminAnalytics().then(setData).catch((e: Error) => setError(e.message))
  }, [])

  if (error) {
    return <div style={{ background: '#FCFAF4', border: `1px solid ${C.danger}`, borderRadius: 3, padding: '12px 16px', fontSize: 13, color: C.danger }}>{error}</div>
  }
  if (!data) {
    return <div style={{ fontSize: 13, color: C.muted }}>Loading analytics…</div>
  }

  // conic-gradient needs cumulative percentages; a platform with no cases yet gets one flat ring.
  let acc = 0
  const donutStops = data.total_cases === 0
    ? `${C.border} 0% 100%`
    : data.case_status.map((s, i) => {
        const start = acc
        acc += (s.count / data.total_cases) * 100
        return `${statusColor(s.label, i)} ${start}% ${acc}%`
      }).join(', ')

  const growthMax = Math.max(...data.case_growth.map((m) => m.count), 1)

  const aiVals = data.ai_usage.map((w) => w.count)
  const aiMax = Math.max(...aiVals, 1)
  const aiPoints = aiVals.map((v, i) => ({
    x: (i / Math.max(aiVals.length - 1, 1)) * (CHART_W - 2 * CHART_PAD) + CHART_PAD,
    y: CHART_H - CHART_PAD - (v / aiMax) * (CHART_H - 2 * CHART_PAD),
  }))
  const aiLinePoints = aiPoints.map((p) => `${p.x},${p.y}`).join(' ')
  const aiAreaPoints = `${aiLinePoints} ${CHART_W - CHART_PAD},${CHART_H - CHART_PAD} ${CHART_PAD},${CHART_H - CHART_PAD}`

  const docInsights: { label: string; value: number; icon: IconName; color: string }[] = [
    { label: 'Total Documents', value: data.documents.total, icon: 'file-text', color: C.primaryDark },
    { label: 'AI Summarized', value: data.documents.summarized, icon: 'check-circle', color: C.success },
    { label: 'Awaiting Summary', value: data.documents.awaiting_summary, icon: 'sparkles', color: C.warning },
    { label: 'Deleted', value: data.documents.deleted, icon: 'trash-2', color: C.danger },
  ]

  const storagePct = Math.min((data.storage.used_bytes / data.storage.quota_bytes) * 100, 100)

  return (
    <>
      <div>
        <div className={styles.pageTitle}>Analytics</div>
        <div className={styles.pageSubtitle}>Case distribution, filing growth, AI workload and document storage.</div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>System Analytics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 20, alignItems: 'stretch' }}>
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Case Status</div>
            <div style={{ fontSize: 12, color: '#6E6759', marginBottom: 16 }}>Distribution across all cases</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 150, height: 150, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${donutStops})` }}>
                <div style={{ width: 92, height: 92, background: '#FCFAF4', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A17', fontFamily: "'Spectral',serif", lineHeight: 1 }}>{data.total_cases}</div>
                  <div style={{ fontSize: 10.5, color: '#6E6759', marginTop: 2 }}>total cases</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {data.case_status.length === 0 && <div style={{ fontSize: 12.5, color: '#8C857A' }}>No cases yet.</div>}
              {data.case_status.map((s, i) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#33302A' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: statusColor(s.label, i), flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <span style={{ fontWeight: 600, color: '#6E6759' }}>{Math.round((s.count / data.total_cases) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Monthly Case Growth</div>
            <div style={{ fontSize: 12, color: '#6E6759', marginBottom: 18 }}>New cases filed, last 6 months</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 150, padding: '0 4px' }}>
              {data.case_growth.map((m) => (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#6E6759', fontWeight: 600 }}>{m.count}</div>
                  <div style={{ width: '60%', maxWidth: 34, height: `${(m.count / growthMax) * 110}px`, minHeight: 2, borderRadius: '3px 8px 3px 3px', background: 'linear-gradient(180deg,#C9A47C,#23306B)' }} />
                  <div style={{ fontSize: 11.5, color: '#6E6759', fontWeight: 500 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle} style={{ marginBottom: 4 }}>AI Usage Trend</div>
            <div style={{ fontSize: 12, color: '#6E6759', marginBottom: 14 }}>AI summaries generated, last 8 weeks</div>
            <svg viewBox="0 0 300 140" width="100%" height={150} preserveAspectRatio="none">
              <polygon points={aiAreaPoints} fill={C.primary} opacity={0.12} />
              <polyline points={aiLinePoints} fill="none" stroke={C.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {aiPoints.map((p) => <circle key={p.x} cx={p.x} cy={p.y} r={3} fill={C.primary} />)}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8C857A', marginTop: 4 }}>
              <span>{data.ai_usage[0]?.label}</span><span>{data.ai_usage[data.ai_usage.length - 1]?.label}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>Document Insights</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
          {docInsights.map((d) => (
            <div key={d.label} style={{ background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 3, background: d.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={d.icon} size={17} color={d.color} /></div>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 21, fontWeight: 700, color: '#1A1A17' }}>{d.value}</div>
              <div style={{ fontSize: 12, color: '#6E6759', fontWeight: 500 }}>{d.label}</div>
            </div>
          ))}
        </div>
        <div className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A17' }}>Storage Usage</div>
            <div style={{ fontSize: 12.5, color: '#6E6759' }}>{formatBytes(data.storage.used_bytes)} of {formatBytes(data.storage.quota_bytes)} used</div>
          </div>
          <div style={{ height: 10, background: '#E6E0CE', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${storagePct}%`, height: '100%', background: 'linear-gradient(90deg,#23306B,#CFC6B0)', borderRadius: 3 }} /></div>
        </div>
      </div>
    </>
  )
}
