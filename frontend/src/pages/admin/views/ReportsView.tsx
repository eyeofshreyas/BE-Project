
/** Admin console "Reports" tab: report-library list with search/category/date/type/status
 * filters, CSV export, on-demand report generation, and browser-based PDF printing.
 */
import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { formatDate } from '../../../utils/date'
import { downloadCsv } from '../../../utils/files'
import styles from '../../../components/AppShell.module.css'

type ReportType = 'Scheduled' | 'One-off'
type ReportStatus = 'Ready' | 'Pending'

type Report = {
  id: string
  label: string
  desc: string
  icon: IconName
  category: string
  type: ReportType
  status: ReportStatus
  generated: Date
}

const CATEGORY_CHIPS = ['All Reports', 'Cases', 'Revenue', 'Lawyers', 'Clients', 'AI', 'Compliance']

const CATEGORY_ICON: Record<string, IconName> = {
  Cases: 'scale',
  Revenue: 'banknote',
  Lawyers: 'briefcase',
  Clients: 'users',
  AI: 'sparkles',
  Compliance: 'shield',
}

const DATE_RANGES = ['This Week', 'This Month', 'This Year'] as const
const TYPE_FILTERS = ['All Reports', 'Scheduled', 'One-off'] as const
const STATUS_FILTERS = ['All', 'Ready', 'Pending'] as const

function seedReports(): Report[] {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d
  }

  return [
    {
      id: 'seed-1',
      label: 'Case Reports',
      desc: 'Filing trends, case outcomes and litigation activity',
      icon: 'scale',
      category: 'Cases',
      type: 'Scheduled',
      status: 'Ready',
      generated: day(5),
    },
    {
      id: 'seed-2',
      label: 'Revenue Reports',
      desc: 'Monthly billing, collections and payment trends',
      icon: 'banknote',
      category: 'Revenue',
      type: 'Scheduled',
      status: 'Ready',
      generated: day(7),
    },
    {
      id: 'seed-3',
      label: 'Lawyer Performance',
      desc: 'Caseload, resolution speed and lawyer activity',
      icon: 'briefcase',
      category: 'Lawyers',
      type: 'One-off',
      status: 'Ready',
      generated: day(8),
    },
    {
      id: 'seed-4',
      label: 'Client Statistics',
      desc: 'Client growth, engagement and activity',
      icon: 'users',
      category: 'Clients',
      type: 'Scheduled',
      status: 'Pending',
      generated: day(9),
    },
    {
      id: 'seed-5',
      label: 'AI Usage Report',
      desc: 'AI summaries, searches, translations and document processing',
      icon: 'sparkles',
      category: 'AI',
      type: 'One-off',
      status: 'Ready',
      generated: day(10),
    },
    {
      id: 'seed-6',
      label: 'Audit & Compliance',
      desc: 'User activity, access logs and system events',
      icon: 'shield',
      category: 'Compliance',
      type: 'Scheduled',
      status: 'Pending',
      generated: day(11),
    },
  ]
}

function inDateRange(d: Date, range: string, now: Date) {
  if (range === 'This Week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)

    return d >= start && d <= now
  }

  if (range === 'This Month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }

  return d.getFullYear() === now.getFullYear()
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

const BTN_GHOST = {
  fontSize: 13,
  fontWeight: 600,
  padding: '10px 18px',
  borderRadius: 3,
  cursor: 'pointer',
  background: '#FCFAF4',
  color: C.text,
  border: `1px solid ${C.border}`,
}

const BTN_PRIMARY = {
  fontSize: 13,
  fontWeight: 600,
  padding: '10px 18px',
  borderRadius: 3,
  cursor: 'pointer',
  background: C.primary,
  color: '#FCFAF4',
  boxShadow: '0 4px 12px rgba(35, 48, 107,.28)',
}

/** `onToast`, if given, gets a short message to surface to the admin -- optional because
 * standalone renders of this view (tests, storybook-ish use) shouldn't need a toast host.
 */
export default function ReportsView({
  onToast,
}: {
  onToast?: (msg: string) => void
} = {}) {
  const [reports, setReports] = useState<Report[]>(seedReports)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Reports')

  const [pending, setPending] = useState({
    date: 'This Month' as (typeof DATE_RANGES)[number],
    type: 'All Reports' as (typeof TYPE_FILTERS)[number],
    status: 'All' as (typeof STATUS_FILTERS)[number],
  })

  const [active, setActive] = useState(pending)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)

  const now = useMemo(() => new Date(), [])
  const lastUpdated = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const visible = reports.filter((r) => {
    if (category !== 'All Reports' && r.category !== category) return false

    if (
      search &&
      !r.label.toLowerCase().includes(search.toLowerCase()) &&
      !r.desc.toLowerCase().includes(search.toLowerCase())
    ) {
      return false
    }

    if (active.type !== 'All Reports' && r.type !== active.type) return false
    if (active.status !== 'All' && r.status !== active.status) return false
    if (!inDateRange(r.generated, active.date, now)) return false

    return true
  })

  function resetFilters() {
    setSearch('')
    setCategory('All Reports')

    const defaults = {
      date: 'This Month' as const,
      type: 'All Reports' as const,
      status: 'All' as const,
    }

    setPending(defaults)
    setActive(defaults)
  }

  function generateReport() {
    const cat = category === 'All Reports' ? 'Cases' : category

    const report: Report = {
      id: crypto.randomUUID(),
      label: `${cat} Report — ${now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      })}`,
      desc: `On-demand summary of ${cat.toLowerCase()} activity, generated just now.`,
      icon: CATEGORY_ICON[cat] ?? 'file-text',
      category: cat,
      type: 'One-off',
      status: 'Ready',
      generated: new Date(),
    }

    setReports((prev) => [report, ...prev])
    onToast?.('Report generated.')
  }

  // Drop the selection once the dialog closes (afterprint fires on cancel too), so a
  // later Ctrl+P prints the library rather than whichever report was last viewed.
  useEffect(() => {
    const clear = () => setSelectedReport(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  function printReport(report: Report) {
    setSelectedReport(report)

    // Allow React to render the printable report before opening
    // the browser print dialog.
    setTimeout(() => {
      window.print()
    }, 0)
  }

  function printAllReports() {
    setSelectedReport(null)
    setExportOpen(false)

    // Allow React to render the complete report library before printing.
    setTimeout(() => {
      window.print()
    }, 0)
  }

  return (
    <>
      <style>
        {`
          .lexflow-print-report {
            display: none;
          }

          @media print {
            @page {
              margin: 18mm;
            }

            body {
              background: #ffffff !important;
            }

            body * {
              visibility: hidden !important;
            }

            .lexflow-print-report,
            .lexflow-print-report * {
              visibility: visible !important;
            }

            .lexflow-print-report {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              color: #111111;
              background: #ffffff;
              font-family: Arial, Helvetica, sans-serif;
            }

            .lexflow-print-header {
              border-bottom: 2px solid #222222;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }

            .lexflow-print-header h1 {
              margin: 0 0 8px;
              font-size: 24px;
              line-height: 1.3;
            }

            .lexflow-print-header p {
              margin: 0;
              font-size: 13px;
              color: #555555;
              line-height: 1.5;
            }

            .lexflow-print-meta {
              margin-top: 16px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8px;
              font-size: 12px;
              line-height: 1.5;
            }

            .lexflow-print-section {
              margin-top: 24px;
            }

            .lexflow-print-section h2 {
              font-size: 16px;
              margin: 0 0 12px;
              page-break-after: avoid;
            }

            .lexflow-print-report table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            .lexflow-print-report th,
            .lexflow-print-report td {
              border: 1px solid #bbbbbb;
              padding: 8px;
              text-align: left;
              vertical-align: top;
              line-height: 1.4;
            }

            .lexflow-print-report th {
              font-weight: 700;
              background: #f3f3f3 !important;
            }

            .lexflow-print-report tr {
              page-break-inside: avoid;
            }
          }
        `}
      </style>

      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Reports</div>

          <div className={styles.pageSubtitle}>
            Generate, analyze and export platform reports from one central workspace.
          </div>

          <div
            style={{
              fontSize: 12.5,
              color: C.muted,
              marginTop: 6,
            }}
          >
            Last updated today at {lastUpdated}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                ...BTN_GHOST,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => setExportOpen((v) => !v)}
            >
              <Icon name="download" size={15} color={C.primaryDark} />
              <span>Export</span>
              <Icon name="chevron-down" size={14} color="#8C857A" />
            </div>

            {exportOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '110%',
                  right: 0,
                  background: '#FCFAF4',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  boxShadow: '0 8px 24px rgba(35,48,107,.15)',
                  zIndex: 10,
                  minWidth: 150,
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#33302A',
                    cursor: 'pointer',
                  }}
                  onClick={printAllReports}
                >
                  Export PDF
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#33302A',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setExportOpen(false)

                    downloadCsv(
                      'lexflow-reports',
                      [
                        'Report',
                        'Description',
                        'Category',
                        'Type',
                        'Status',
                        'Last Generated',
                      ],
                      visible.map((r) => [
                        r.label,
                        r.desc,
                        r.category,
                        r.type,
                        r.status,
                        formatDate(r.generated.toISOString()),
                      ]),
                    )
                  }}
                >
                  Export Excel
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              ...BTN_PRIMARY,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={generateReport}
          >
            <Icon name="plus" size={15} color="#FCFAF4" />
            <span>Generate Report</span>
          </div>
        </div>
      </div>

      <div
        className={styles.card}
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#F6F2E9',
              border: `1.5px solid ${C.border}`,
              borderRadius: 3,
              padding: '10px 14px',
            }}
          >
            <Icon name="search" size={16} color="#8C857A" />

            <input
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13.5,
                flex: 1,
                fontFamily: "'Public Sans',sans-serif",
                color: C.text,
              }}
            />
          </div>
        </div>

        <div>
          <div style={FILTER_LABEL}>Date</div>

          <select
            value={pending.date}
            onChange={(e) =>
              setPending((p) => ({
                ...p,
                date: e.target.value as typeof pending.date,
              }))
            }
            style={SELECT_STYLE}
          >
            {DATE_RANGES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={FILTER_LABEL}>Type</div>

          <select
            value={pending.type}
            onChange={(e) =>
              setPending((p) => ({
                ...p,
                type: e.target.value as typeof pending.type,
              }))
            }
            style={SELECT_STYLE}
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={FILTER_LABEL}>Status</div>

          <select
            value={pending.status}
            onChange={(e) =>
              setPending((p) => ({
                ...p,
                status: e.target.value as typeof pending.status,
              }))
            }
            style={SELECT_STYLE}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div
          style={BTN_PRIMARY}
          onClick={() => setActive(pending)}
        >
          Apply Filters
        </div>

        <div
          style={BTN_GHOST}
          onClick={resetFilters}
        >
          Reset
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
          gap: 12,
        }}
      >
        <div
          className={styles.card}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={FILTER_LABEL}>Reports Generated</div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontFamily: "'Spectral',serif",
                fontSize: 25,
                fontWeight: 700,
                color: '#1A1A17',
                lineHeight: 1,
              }}
            >
              {reports.length}
            </div>

            <span
              className={styles.pill}
              style={pillStyle(C.success)}
            >
              {reports.filter((r) => r.type === 'One-off').length} one-off
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#6E6759' }}>
            Total active dossiers
          </div>
        </div>

        <div
          className={styles.card}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={FILTER_LABEL}>Reports This Month</div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontFamily: "'Spectral',serif",
                fontSize: 25,
                fontWeight: 700,
                color: '#1A1A17',
                lineHeight: 1,
              }}
            >
              {
                reports.filter((r) =>
                  inDateRange(r.generated, 'This Month', now),
                ).length
              }
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#6E6759' }}>
            Platform volume pace
          </div>
        </div>

        <div
          className={styles.card}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={FILTER_LABEL}>Scheduled Reports</div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontFamily: "'Spectral',serif",
                fontSize: 25,
                fontWeight: 700,
                color: '#1A1A17',
                lineHeight: 1,
              }}
            >
              {reports.filter((r) => r.type === 'Scheduled').length}
            </div>

            <span
              className={styles.pill}
              style={pillStyle(C.warning)}
            >
              {
                reports.filter(
                  (r) =>
                    r.type === 'Scheduled' &&
                    r.status === 'Pending',
                ).length
              } due this week
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#6E6759' }}>
            Automated cron cycles
          </div>
        </div>

        <div
          className={styles.card}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={FILTER_LABEL}>Last Generated</div>

          <div
            style={{
              fontFamily: "'Spectral',serif",
              fontSize: 25,
              fontWeight: 700,
              color: '#1A1A17',
              lineHeight: 1,
            }}
          >
            {lastUpdated} Today
          </div>

          <div style={{ fontSize: 12, color: '#6E6759' }}>
            {reports[0]?.label ?? '—'}
          </div>
        </div>
      </div>

      <div>
        <div
          className={styles.pageHeadRow}
          style={{ marginBottom: 14 }}
        >
          <div>
            <div className={styles.sectionTitle}>
              Report Library
            </div>

            <div
              style={{
                fontSize: 12.5,
                color: C.muted,
                marginTop: 4,
              }}
            >
              Standard enterprise templates configured for partner &amp;
              compliance review.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {CATEGORY_CHIPS.map((c) => {
              const chipActive = c === category

              return (
                <div
                  key={c}
                  className={styles.chipBase}
                  style={{
                    borderRadius: 999,
                    padding: '8px 15px',
                    background: chipActive
                      ? C.primary
                      : '#F1EDE0',
                    color: chipActive
                      ? '#FCFAF4'
                      : '#575145',
                  }}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </div>
              )
            })}
          </div>
        </div>

        <div
          className={styles.card}
          style={{ padding: 0 }}
        >
          {visible.length === 0 && (
            <div
              style={{
                padding: '24px 22px',
                fontSize: 13.5,
                color: C.muted,
              }}
            >
              No reports match this filter.
            </div>
          )}

          {visible.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 22px',
                borderBottom:
                  i === visible.length - 1
                    ? 'none'
                    : `1px solid #F1EDE0`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 3,
                  background: '#E6E0CE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon
                  name={r.icon}
                  size={19}
                  color={C.primaryDark}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#1A1A17',
                  }}
                >
                  {r.label}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#6E6759',
                    marginTop: 2,
                  }}
                >
                  {r.desc}
                </div>
              </div>

              <span
                className={styles.pill}
                style={pillStyle(
                  r.status === 'Ready'
                    ? C.success
                    : C.warning,
                )}
              >
                {r.status}
              </span>

              <div
                style={{
                  fontSize: 12,
                  color: C.muted,
                  whiteSpace: 'nowrap',
                }}
              >
                Last generated:{' '}
                {formatDate(r.generated.toISOString())}
              </div>

              <div
                style={{
                  ...BTN_GHOST,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  whiteSpace: 'nowrap',
                }}
                onClick={() => printReport(r)}
              >
                <Icon
                  name="file-text"
                  size={14}
                  color={C.primaryDark}
                />
                <span>View Report</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print-only report content. It is hidden during normal browsing
          and displayed only when the browser print dialog is opened. */}
      <div className="lexflow-print-report">
        {selectedReport ? (
          <>
            <div className="lexflow-print-header">
              <h1>{selectedReport.label}</h1>

              <p>{selectedReport.desc}</p>
            </div>

            <div className="lexflow-print-section">
              <h2>Report Details</h2>

              <table>
                <tbody>
                  <tr>
                    <th>Category</th>
                    <td>{selectedReport.category}</td>
                  </tr>

                  <tr>
                    <th>Type</th>
                    <td>{selectedReport.type}</td>
                  </tr>

                  <tr>
                    <th>Status</th>
                    <td>{selectedReport.status}</td>
                  </tr>

                  <tr>
                    <th>Last Generated</th>
                    <td>
                      {formatDate(
                        selectedReport.generated.toISOString(),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="lexflow-print-header">
              <h1>LexFlow Reports</h1>

              <p>
                Administrative report library
              </p>

              <div className="lexflow-print-meta">
                <div>
                  <strong>Generated:</strong>{' '}
                  {new Date().toLocaleString('en-IN')}
                </div>

                <div>
                  <strong>Reports shown:</strong>{' '}
                  {visible.length}
                </div>
              </div>
            </div>

            <div className="lexflow-print-section">
              <h2>Reports</h2>

              {visible.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Last Generated</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td>{r.label}</td>
                        <td>{r.desc}</td>
                        <td>{r.category}</td>
                        <td>{r.type}</td>
                        <td>{r.status}</td>
                        <td>
                          {formatDate(
                            r.generated.toISOString(),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>
                  No reports match the currently selected
                  filters.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

