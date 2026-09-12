/** Admin console "Reports" tab: report-library list with search/category filters and a
 * stat summary row. No API calls; all data and filter controls are static mock. */
import { useMemo, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import styles from '../../../components/AppShell.module.css'

const REPORTS: { label: string; desc: string; icon: IconName; category: string; lastGenerated: string }[] = [
  { label: 'Case Reports', desc: 'Filing trends, case outcomes and litigation activity', icon: 'scale', category: 'Cases', lastGenerated: '07 Sep 2026' },
  { label: 'Revenue Reports', desc: 'Monthly billing, collections and payment trends', icon: 'banknote', category: 'Revenue', lastGenerated: '05 Sep 2026' },
  { label: 'Lawyer Performance', desc: 'Caseload, resolution speed and lawyer activity', icon: 'briefcase', category: 'Lawyers', lastGenerated: '04 Sep 2026' },
  { label: 'Client Statistics', desc: 'Client growth, engagement and activity', icon: 'users', category: 'Clients', lastGenerated: '03 Sep 2026' },
  { label: 'AI Usage Report', desc: 'AI summaries, searches, translations and document processing', icon: 'sparkles', category: 'AI', lastGenerated: '02 Sep 2026' },
  { label: 'Audit & Compliance', desc: 'User activity, access logs and system events', icon: 'shield', category: 'Compliance', lastGenerated: '01 Sep 2026' },
]

const CATEGORY_CHIPS = ['All Reports', 'Cases', 'Revenue', 'Lawyers', 'Clients', 'AI', 'Compliance']

const STATS: { label: string; value: string; caption: string; badge?: { text: string; color: string } }[] = [
  { label: 'Reports Generated', value: '128', caption: 'Total active dossiers', badge: { text: '+12% this month', color: C.success } },
  { label: 'Reports This Month', value: '24', caption: 'Platform volume pace', badge: { text: '+8% from last month', color: C.success } },
  { label: 'Scheduled Reports', value: '8', caption: 'Automated cron cycles', badge: { text: '2 due this week', color: C.warning } },
]

const FILTER_LABEL = { fontSize: 9.5, fontWeight: 700, color: '#6E6759', fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase' as const, letterSpacing: '.12em', marginBottom: 6 }
const SELECT_STYLE = { background: '#F6F2E9', border: `1.5px solid ${C.border}`, borderRadius: 3, padding: '9px 12px', fontSize: 13, color: C.text, fontFamily: "'Public Sans',sans-serif", outline: 'none' }
const BTN_GHOST = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: '#FCFAF4', color: C.text, border: `1px solid ${C.border}` }
const BTN_PRIMARY = { fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 3, cursor: 'pointer', background: C.primary, color: '#FCFAF4', boxShadow: '0 4px 12px rgba(35, 48, 107,.28)' }

/** Renders the stat summary row and the filterable `REPORTS` list. Search and the category
 * chips filter in memory; the Date/Type/Status selects are cosmetic (mirroring the mock --
 * there's no per-report dataset here to actually range/type-filter). */
export default function ReportsView() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Reports')
  const [exportOpen, setExportOpen] = useState(false)
  const lastUpdated = useMemo(() => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), [])

  const visible = REPORTS.filter((r) => {
    if (category !== 'All Reports' && r.category !== category) return false
    if (search && !r.label.toLowerCase().includes(search.toLowerCase()) && !r.desc.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Reports</div>
          <div className={styles.pageSubtitle}>Generate, analyze and export platform reports from one central workspace.</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Last updated today at {lastUpdated}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setExportOpen((v) => !v)}>
              <Icon name="download" size={15} color={C.primaryDark} /><span>Export</span><Icon name="chevron-down" size={14} color="#8C857A" />
            </div>
            {exportOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: '#FCFAF4', border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: '0 8px 24px rgba(35,48,107,.15)', zIndex: 10, minWidth: 150 }}>
                {['Export PDF', 'Export Excel'].map((opt) => (
                  <div key={opt} style={{ padding: '10px 14px', fontSize: 13, color: '#33302A', cursor: 'pointer' }} onClick={() => setExportOpen(false)}>{opt}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ ...BTN_PRIMARY, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={15} color="#FCFAF4" /><span>Generate Report</span>
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F6F2E9', border: `1.5px solid ${C.border}`, borderRadius: 3, padding: '10px 14px' }}>
            <Icon name="search" size={16} color="#8C857A" />
            <input placeholder="Search reports..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, fontFamily: "'Public Sans',sans-serif", color: C.text }} />
          </div>
        </div>
        <div><div style={FILTER_LABEL}>Date</div><select style={SELECT_STYLE}><option>This Month</option><option>This Week</option><option>This Year</option></select></div>
        <div><div style={FILTER_LABEL}>Type</div><select style={SELECT_STYLE}><option>All Reports</option><option>Scheduled</option><option>One-off</option></select></div>
        <div><div style={FILTER_LABEL}>Status</div><select style={SELECT_STYLE}><option>All</option><option>Ready</option><option>Pending</option></select></div>
        <div style={BTN_PRIMARY}>Apply Filters</div>
        <div style={BTN_GHOST} onClick={() => setSearch('')}>Reset</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.card} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={FILTER_LABEL}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 25, fontWeight: 700, color: '#1A1A17', lineHeight: 1 }}>{s.value}</div>
              {s.badge && <span className={styles.pill} style={pillStyle(s.badge.color)}>{s.badge.text}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#6E6759' }}>{s.caption}</div>
          </div>
        ))}
        <div className={styles.card} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={FILTER_LABEL}>Last Generated</div>
          <div style={{ fontFamily: "'Spectral',serif", fontSize: 25, fontWeight: 700, color: '#1A1A17', lineHeight: 1 }}>{lastUpdated} Today</div>
          <div style={{ fontSize: 12, color: '#6E6759' }}>Case Dispositions Q3</div>
        </div>
      </div>

      <div>
        <div className={styles.pageHeadRow} style={{ marginBottom: 14 }}>
          <div>
            <div className={styles.sectionTitle}>Report Library</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Standard enterprise templates configured for partner &amp; compliance review.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORY_CHIPS.map((c) => {
              const active = c === category
              return (
                <div key={c} className={styles.chipBase} style={{ borderRadius: 999, padding: '8px 15px', background: active ? C.primary : '#F1EDE0', color: active ? '#FCFAF4' : '#575145' }} onClick={() => setCategory(c)}>
                  {c}
                </div>
              )
            })}
          </div>
        </div>

        <div className={styles.card} style={{ padding: 0 }}>
          {visible.length === 0 && <div style={{ padding: '24px 22px', fontSize: 13.5, color: C.muted }}>No reports match this filter.</div>}
          {visible.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', borderBottom: i === visible.length - 1 ? 'none' : `1px solid #F1EDE0` }}>
              <div style={{ width: 40, height: 40, borderRadius: 3, background: '#E6E0CE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={r.icon} size={19} color={C.primaryDark} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A17' }}>{r.label}</div>
                <div style={{ fontSize: 12, color: '#6E6759', marginTop: 2 }}>{r.desc}</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>Last generated: {r.lastGenerated}</div>
              <div style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <Icon name="file-text" size={14} color={C.primaryDark} /><span>View Report</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
