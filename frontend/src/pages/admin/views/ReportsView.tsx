
/** Admin console "Reports" tab: report-library list with search/category/date/type/status
 * filters, CSV export, on-demand report generation, and browser-based PDF printing.
 */
import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { C, pillStyle } from '../../../components/theme'
import { formatDate } from '../../../utils/date'
import { formatCompactINR } from '../../../utils/money'
import { downloadCsv } from '../../../utils/files'
import { listCases, listClients, listDocuments } from '../../../api/client'
import type { CaseSummary, ClientSummary, DocumentSummary, UserProfile } from '../../../types/api'
import styles from '../../../components/AppShell.module.css'

type ReportType = 'Scheduled' | 'One-off'
type ReportStatus = 'Ready' | 'Pending'

type ReportMetric = { label: string; value: string }

type Report = {
  id: string
  label: string
  desc: string
  icon: IconName
  category: string
  type: ReportType
  status: ReportStatus
  generated: Date
  caseRef?: string
  client?: string
  lawyer?: string
  generatedBy?: string
  metrics?: ReportMetric[]
  tableColumns?: string[]
  tableRows?: string[][]
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('lexflow_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
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
  // Clamped to the current month so the default "This Month" filter always
  // has matches, even on the 1st-6th when a fixed offset would spill into
  // the previous month.
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(Math.max(1, d.getDate() - offset))
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
      generated: day(1),
      caseRef: 'CASE-1042',
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Cases', value: '48' },
        { label: 'Open', value: '19' },
        { label: 'Closed', value: '22' },
        { label: 'High Priority', value: '7' },
      ],
      tableColumns: ['Case', 'Client', 'Status', 'Priority', 'Next Hearing'],
      tableRows: [
        ['CASE-1042', 'Jane Doe', 'Open', 'High', '12 Oct'],
        ['CASE-1038', 'Meridian Holdings', 'Closed', 'Medium', '—'],
        ['CASE-1025', 'Harlow & Finch LLP', 'In Progress', 'Low', '20 Oct'],
      ],
    },
    {
      id: 'seed-2',
      label: 'Revenue Reports',
      desc: 'Monthly billing, collections and payment trends',
      icon: 'banknote',
      category: 'Revenue',
      type: 'Scheduled',
      status: 'Ready',
      generated: day(2),
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Claim Value', value: '₹2.4 Cr' },
        { label: 'Cases With Claim Value', value: '31' },
        { label: 'Average Claim Value', value: '₹7.7 L' },
      ],
      tableColumns: ['Case', 'Client', 'Claim Value'],
      tableRows: [
        ['CASE-0987', 'Harlow & Finch LLP', '₹42.5 L'],
        ['CASE-1042', 'Jane Doe', '₹18.0 L'],
      ],
    },
    {
      id: 'seed-3',
      label: 'Lawyer Performance',
      desc: 'Caseload, resolution speed and lawyer activity',
      icon: 'briefcase',
      category: 'Lawyers',
      type: 'One-off',
      status: 'Ready',
      generated: day(2),
      lawyer: 'Aisha Khan',
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Active Lawyers', value: '6' },
        { label: 'Total Assignments', value: '48' },
        { label: 'Avg Cases / Lawyer', value: '8.0' },
      ],
      tableColumns: ['Lawyer', 'Cases Assigned'],
      tableRows: [
        ['Aisha Khan', '14'],
        ['Rohan Verma', '11'],
        ['Priya Nair', '9'],
      ],
    },
    {
      id: 'seed-4',
      label: 'Client Statistics',
      desc: 'Client growth, engagement and activity',
      icon: 'users',
      category: 'Clients',
      type: 'Scheduled',
      status: 'Pending',
      generated: day(3),
      client: 'Meridian Holdings',
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Clients', value: '52' },
        { label: 'Active Clients', value: '45' },
        { label: 'Total Pending Amount', value: '₹6.1 L' },
      ],
      tableColumns: ['Client', 'Status', 'Active Cases', 'Pending Amount'],
      tableRows: [
        ['Meridian Holdings', 'Active', '3', '₹1.2 L'],
        ['Harlow & Finch LLP', 'Active', '2', '₹0'],
      ],
    },
    {
      id: 'seed-5',
      label: 'AI Usage Report',
      desc: 'AI summaries, searches, translations and document processing',
      icon: 'sparkles',
      category: 'AI',
      type: 'One-off',
      status: 'Ready',
      generated: day(3),
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Documents Uploaded', value: '134' },
        { label: 'AI Summaries Generated', value: '98' },
      ],
      tableColumns: ['Document', 'Case', 'AI Summary'],
      tableRows: [
        ['affidavit.pdf', 'CASE-1042', 'Yes'],
        ['contract.pdf', 'CASE-0987', 'No'],
      ],
    },
    {
      id: 'seed-6',
      label: 'Audit & Compliance',
      desc: 'User activity, access logs and system events',
      icon: 'shield',
      category: 'Compliance',
      type: 'Scheduled',
      status: 'Pending',
      generated: day(4),
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Documents Logged', value: '134' },
        { label: 'Pending Signature', value: '5' },
      ],
      tableColumns: ['Document', 'Type', 'Uploaded By', 'Upload Date'],
      tableRows: [
        ['nda.pdf', 'Agreement', 'Aisha Khan', 'Sep 28, 2026'],
        ['poa.pdf', 'Power of Attorney', 'Rohan Verma', 'Sep 25, 2026'],
      ],
    },
    {
      id: 'seed-7',
      label: 'Case Backlog Summary',
      desc: 'Open vs. closed cases and average time to resolution',
      icon: 'scale',
      category: 'Cases',
      type: 'One-off',
      status: 'Ready',
      generated: day(5),
      caseRef: 'CASE-0987',
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Cases', value: '48' },
        { label: 'Avg Days Open', value: '34' },
        { label: 'Backlogged (30d+)', value: '11' },
      ],
      tableColumns: ['Case', 'Client', 'Status', 'Priority', 'Next Hearing'],
      tableRows: [
        ['CASE-0987', 'Harlow & Finch LLP', 'In Progress', 'High', '18 Oct'],
        ['CASE-1012', 'Meridian Holdings', 'Open', 'Medium', '—'],
      ],
    },
    {
      id: 'seed-8',
      label: 'Outstanding Invoices',
      desc: 'Unpaid and overdue client invoices by firm',
      icon: 'banknote',
      category: 'Revenue',
      type: 'One-off',
      status: 'Pending',
      generated: day(5),
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Claim Value', value: '₹1.1 Cr' },
        { label: 'Cases With Claim Value', value: '14' },
        { label: 'Average Claim Value', value: '₹7.9 L' },
      ],
      tableColumns: ['Case', 'Client', 'Claim Value'],
      tableRows: [
        ['CASE-1042', 'Jane Doe', '₹18.0 L'],
      ],
    },
    {
      id: 'seed-9',
      label: 'New Client Onboarding',
      desc: 'Recently onboarded clients and intake conversion rate',
      icon: 'users',
      category: 'Clients',
      type: 'One-off',
      status: 'Ready',
      generated: day(6),
      client: 'Harlow & Finch LLP',
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Total Clients', value: '52' },
        { label: 'Active Clients', value: '45' },
        { label: 'Total Pending Amount', value: '₹6.1 L' },
      ],
      tableColumns: ['Client', 'Status', 'Active Cases', 'Pending Amount'],
      tableRows: [
        ['Harlow & Finch LLP', 'Active', '2', '₹0'],
      ],
    },
    {
      id: 'seed-10',
      label: 'Data Retention Audit',
      desc: 'Document retention compliance and access-control review',
      icon: 'shield',
      category: 'Compliance',
      type: 'One-off',
      status: 'Ready',
      generated: day(6),
      generatedBy: 'Meera Sharma',
      metrics: [
        { label: 'Documents Logged', value: '134' },
        { label: 'Pending Signature', value: '5' },
      ],
      tableColumns: ['Document', 'Type', 'Uploaded By', 'Upload Date'],
      tableRows: [
        ['retention-policy.pdf', 'Policy', 'Meera Sharma', 'Sep 20, 2026'],
      ],
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advanced, setAdvanced] = useState({ caseRef: '', client: '', lawyer: '' })

  const [pending, setPending] = useState({
    date: 'This Month' as (typeof DATE_RANGES)[number],
    type: 'All Reports' as (typeof TYPE_FILTERS)[number],
    status: 'All' as (typeof STATUS_FILTERS)[number],
  })

  const [active, setActive] = useState(pending)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [panel, setPanel] = useState<{ mode: 'preview' | 'edit' | 'delete'; report: Report } | null>(null)
  const [editDraft, setEditDraft] = useState({ label: '', desc: '' })
  const [configOpen, setConfigOpen] = useState(false)
  const [configDraft, setConfigDraft] = useState({
    category: 'Cases',
    date: 'This Month' as (typeof DATE_RANGES)[number],
  })

  // Backs real report content (see buildReportContent) -- loaded once, same data
  // source the Cases/Clients/Documents admin tabs already use.
  const [liveCases, setLiveCases] = useState<CaseSummary[]>([])
  const [liveClients, setLiveClients] = useState<ClientSummary[]>([])
  const [liveDocuments, setLiveDocuments] = useState<DocumentSummary[]>([])

  useEffect(() => {
    Promise.all([listCases(), listClients(), listDocuments()])
      .then(([cases, clients, documents]) => {
        setLiveCases(cases)
        setLiveClients(clients)
        setLiveDocuments(documents)
      })
      .catch(() => {})
  }, [])

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

    if (advanced.caseRef && !(r.caseRef ?? '').toLowerCase().includes(advanced.caseRef.toLowerCase())) return false
    if (advanced.client && !(r.client ?? '').toLowerCase().includes(advanced.client.toLowerCase())) return false
    if (advanced.lawyer && !(r.lawyer ?? '').toLowerCase().includes(advanced.lawyer.toLowerCase())) return false

    return true
  })

  function resetFilters() {
    setSearch('')
    setCategory('All Reports')
    setAdvanced({ caseRef: '', client: '', lawyer: '' })

    const defaults = {
      date: 'This Month' as const,
      type: 'All Reports' as const,
      status: 'All' as const,
    }

    setPending(defaults)
    setActive(defaults)
  }

  function casesInRange(range: string) {
    return liveCases.filter((c) => {
      const iso = c.filing_date ?? c.created_at
      return iso ? inDateRange(new Date(iso), range, now) : false
    })
  }

  function documentsInRange(range: string) {
    return liveDocuments.filter((d) => inDateRange(new Date(d.upload_date), range, now))
  }

  // Pulls real counts/rows out of whatever's currently loaded from the Cases/Clients/
  // Documents endpoints, scoped to the chosen date range -- this is what makes a
  // generated report contain actual data instead of just metadata.
  function buildReportContent(cat: string, range: string): { desc: string; metrics: ReportMetric[]; tableColumns: string[]; tableRows: string[][] } {
    const rangeLabel = range.toLowerCase()

    if (cat === 'Cases') {
      const scoped = casesInRange(range)
      const closed = scoped.filter((c) => c.status === 'Closed' || c.status === 'Completed').length
      const open = scoped.filter((c) => c.status === 'Open').length
      const highPriority = scoped.filter((c) => c.priority === 'High').length
      return {
        desc: `${scoped.length} case${scoped.length === 1 ? '' : 's'} filed ${rangeLabel}, generated just now.`,
        metrics: [
          { label: 'Total Cases', value: String(scoped.length) },
          { label: 'Open', value: String(open) },
          { label: 'Closed', value: String(closed) },
          { label: 'High Priority', value: String(highPriority) },
        ],
        tableColumns: ['Case', 'Client', 'Status', 'Priority', 'Next Hearing'],
        tableRows: scoped.slice(0, 10).map((c) => [c.id, c.client ?? '—', c.status, c.priority, c.hearing ? formatDate(c.hearing) : '—']),
      }
    }

    if (cat === 'Revenue') {
      const scoped = casesInRange(range).filter((c) => c.claim_value != null)
      const total = scoped.reduce((sum, c) => sum + (c.claim_value ?? 0), 0)
      const avg = scoped.length ? total / scoped.length : 0
      return {
        desc: `${formatCompactINR(total)} in claim value across ${scoped.length} case${scoped.length === 1 ? '' : 's'} filed ${rangeLabel}.`,
        metrics: [
          { label: 'Total Claim Value', value: formatCompactINR(total) },
          { label: 'Cases With Claim Value', value: String(scoped.length) },
          { label: 'Average Claim Value', value: formatCompactINR(avg) },
        ],
        tableColumns: ['Case', 'Client', 'Claim Value'],
        tableRows: [...scoped]
          .sort((a, b) => (b.claim_value ?? 0) - (a.claim_value ?? 0))
          .slice(0, 10)
          .map((c) => [c.id, c.client ?? '—', formatCompactINR(c.claim_value ?? 0)]),
      }
    }

    if (cat === 'Lawyers') {
      const scoped = casesInRange(range)
      const byLawyer = new Map<string, number>()
      for (const c of scoped) {
        const name = c.lawyer ?? 'Unassigned'
        byLawyer.set(name, (byLawyer.get(name) ?? 0) + 1)
      }
      const rows = [...byLawyer.entries()].sort((a, b) => b[1] - a[1])
      return {
        desc: `Caseload across ${rows.length} lawyer${rows.length === 1 ? '' : 's'} for cases filed ${rangeLabel}.`,
        metrics: [
          { label: 'Active Lawyers', value: String(rows.length) },
          { label: 'Total Assignments', value: String(scoped.length) },
          { label: 'Avg Cases / Lawyer', value: rows.length ? (scoped.length / rows.length).toFixed(1) : '0' },
        ],
        tableColumns: ['Lawyer', 'Cases Assigned'],
        tableRows: rows.slice(0, 10).map(([name, count]) => [name, String(count)]),
      }
    }

    if (cat === 'Clients') {
      const scoped = liveClients
      const active = scoped.filter((c) => c.status === 'Active').length
      const pendingTotal = scoped.reduce((sum, c) => sum + (c.pending_amount ?? 0), 0)
      return {
        desc: `${scoped.length} client${scoped.length === 1 ? '' : 's'} on the platform, generated just now.`,
        metrics: [
          { label: 'Total Clients', value: String(scoped.length) },
          { label: 'Active Clients', value: String(active) },
          { label: 'Total Pending Amount', value: formatCompactINR(pendingTotal) },
        ],
        tableColumns: ['Client', 'Status', 'Active Cases', 'Pending Amount'],
        tableRows: scoped.slice(0, 10).map((c) => [c.full_name, c.status, String(c.active_cases), formatCompactINR(c.pending_amount ?? 0)]),
      }
    }

    if (cat === 'AI') {
      const scoped = documentsInRange(range)
      const withSummary = scoped.filter((d) => d.has_summary).length
      return {
        desc: `${withSummary} of ${scoped.length} document${scoped.length === 1 ? '' : 's'} uploaded ${rangeLabel} have an AI summary.`,
        metrics: [
          { label: 'Documents Uploaded', value: String(scoped.length) },
          { label: 'AI Summaries Generated', value: String(withSummary) },
        ],
        tableColumns: ['Document', 'Case', 'AI Summary'],
        tableRows: scoped.slice(0, 10).map((d) => [d.file_name, d.case_number ?? '—', d.has_summary ? 'Yes' : 'No']),
      }
    }

    // Compliance
    const scoped = documentsInRange(range)
    const pendingSignature = scoped.filter((d) => d.esign_status && d.esign_status !== 'completed').length
    return {
      desc: `${scoped.length} document${scoped.length === 1 ? '' : 's'} logged ${rangeLabel}.`,
      metrics: [
        { label: 'Documents Logged', value: String(scoped.length) },
        { label: 'Pending Signature', value: String(pendingSignature) },
      ],
      tableColumns: ['Document', 'Type', 'Uploaded By', 'Upload Date'],
      tableRows: scoped.slice(0, 10).map((d) => [d.file_name, d.document_type ?? '—', d.uploaded_by ?? '—', formatDate(d.upload_date)]),
    }
  }

  function openGenerateConfig() {
    setConfigDraft({ category: category !== 'All Reports' ? category : 'Cases', date: 'This Month' })
    setConfigOpen(true)
  }

  function submitGenerate() {
    const cat = configDraft.category
    const today = new Date()
    const label = `${cat} Report — ${today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`

    // One auto-labeled report per category per day -- repeat clicks reopen the
    // existing report instead of cluttering the library with identical copies.
    const duplicate = reports.find((r) => r.category === cat && r.type === 'One-off' && r.generated.toDateString() === today.toDateString())
    if (duplicate) {
      setConfigOpen(false)
      setPanel({ mode: 'preview', report: duplicate })
      onToast?.(`A ${cat} report was already generated today — showing the existing one.`)
      return
    }

    const content = buildReportContent(cat, configDraft.date)

    const report: Report = {
      id: crypto.randomUUID(),
      label,
      desc: content.desc,
      icon: CATEGORY_ICON[cat] ?? 'file-text',
      category: cat,
      type: 'One-off',
      status: 'Ready',
      generated: today,
      generatedBy: loadProfile()?.full_name ?? 'You',
      metrics: content.metrics,
      tableColumns: content.tableColumns,
      tableRows: content.tableRows,
    }

    setReports((prev) => [report, ...prev])
    setConfigOpen(false)
    setPanel({ mode: 'preview', report })
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

  function openEdit(report: Report) {
    setEditDraft({ label: report.label, desc: report.desc })
    setPanel({ mode: 'edit', report })
  }

  function saveEdit() {
    if (!panel) return
    const { report } = panel

    setReports((prev) =>
      prev.map((r) => (r.id === report.id ? { ...r, label: editDraft.label, desc: editDraft.desc } : r)),
    )
    setPanel(null)
    onToast?.('Report updated.')
  }

  function duplicateReport(report: Report) {
    const copy: Report = {
      ...report,
      id: crypto.randomUUID(),
      label: `${report.label} (Copy)`,
      type: 'One-off',
      status: 'Ready',
      generated: new Date(),
    }

    setReports((prev) => [copy, ...prev])
    onToast?.('Report duplicated.')
  }

  function confirmDelete() {
    if (!panel) return
    setReports((prev) => prev.filter((r) => r.id !== panel.report.id))
    setPanel(null)
    onToast?.('Report deleted.')
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
            onClick={openGenerateConfig}
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

            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.primaryDark,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Advanced
            </span>
          </div>

          {advancedOpen && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              <input
                placeholder="Case #"
                value={advanced.caseRef}
                onChange={(e) => setAdvanced((a) => ({ ...a, caseRef: e.target.value }))}
                style={{ ...SELECT_STYLE, flex: '1 1 140px' }}
              />
              <input
                placeholder="Client"
                value={advanced.client}
                onChange={(e) => setAdvanced((a) => ({ ...a, client: e.target.value }))}
                style={{ ...SELECT_STYLE, flex: '1 1 140px' }}
              />
              <input
                placeholder="Lawyer"
                value={advanced.lawyer}
                onChange={(e) => setAdvanced((a) => ({ ...a, lawyer: e.target.value }))}
                style={{ ...SELECT_STYLE, flex: '1 1 140px' }}
              />
            </div>
          )}
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
                {r.generatedBy && <> &middot; by {r.generatedBy}</>}
              </div>

              <div
                style={{
                  ...BTN_GHOST,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setPanel({ mode: 'preview', report: r })}
              >
                <Icon
                  name="file-text"
                  size={14}
                  color={C.primaryDark}
                />
                <span>View Report</span>
              </div>

              <span className={styles.actionBtn} title="Edit" onClick={() => openEdit(r)}>
                <Icon name="edit" size={14} color="#575145" />
              </span>

              <span className={styles.actionBtn} title="Duplicate" onClick={() => duplicateReport(r)}>
                <Icon name="copy" size={14} color="#575145" />
              </span>

              <span className={styles.actionBtnDanger} title="Delete" onClick={() => setPanel({ mode: 'delete', report: r })}>
                <Icon name="trash-2" size={14} color={C.danger} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {configOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(35, 48, 107,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 20,
          }}
          onClick={() => setConfigOpen(false)}
        >
          <div
            style={{
              background: '#FCFAF4',
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: 28,
              width: 'min(420px,100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 20, fontWeight: 700, color: C.text }}>Generate Report</div>
              <span className={styles.actionBtn} onClick={() => setConfigOpen(false)} title="Close">
                <Icon name="x" size={15} color="#6E6759" />
              </span>
            </div>

            <div>
              <div style={FILTER_LABEL}>Report Type</div>
              <select
                value={configDraft.category}
                onChange={(e) => setConfigDraft((d) => ({ ...d, category: e.target.value }))}
                style={{ ...SELECT_STYLE, width: '100%' }}
              >
                {CATEGORY_CHIPS.filter((c) => c !== 'All Reports').map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={FILTER_LABEL}>Date Range</div>
              <select
                value={configDraft.date}
                onChange={(e) => setConfigDraft((d) => ({ ...d, date: e.target.value as typeof configDraft.date }))}
                style={{ ...SELECT_STYLE, width: '100%' }}
              >
                {DATE_RANGES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 12, color: C.muted }}>
              Pulls from {configDraft.category === 'Clients' ? liveClients.length : configDraft.category === 'AI' || configDraft.category === 'Compliance' ? liveDocuments.length : liveCases.length} currently loaded record(s).
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <div style={BTN_GHOST} onClick={() => setConfigOpen(false)}>Cancel</div>
              <div style={BTN_PRIMARY} onClick={submitGenerate}>Generate</div>
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(35, 48, 107,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 20,
          }}
          onClick={() => setPanel(null)}
        >
          <div
            style={{
              background: '#FCFAF4',
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: 28,
              width: 'min(480px,100%)',
              maxHeight: '86vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Spectral',serif", fontSize: 20, fontWeight: 700, color: C.text }}>
                {panel.mode === 'preview' ? panel.report.label : panel.mode === 'edit' ? 'Edit Report' : 'Delete Report'}
              </div>
              <span className={styles.actionBtn} onClick={() => setPanel(null)} title="Close">
                <Icon name="x" size={15} color="#6E6759" />
              </span>
            </div>

            {panel.mode === 'preview' && (
              <>
                <div style={{ fontSize: 13.5, color: C.muted }}>{panel.report.desc}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div><div style={FILTER_LABEL}>Category</div>{panel.report.category}</div>
                  <div><div style={FILTER_LABEL}>Type</div>{panel.report.type}</div>
                  <div><div style={FILTER_LABEL}>Status</div>{panel.report.status}</div>
                  <div><div style={FILTER_LABEL}>Last Generated</div>{formatDate(panel.report.generated.toISOString())}</div>
                  {panel.report.caseRef && <div><div style={FILTER_LABEL}>Case</div>{panel.report.caseRef}</div>}
                  {panel.report.client && <div><div style={FILTER_LABEL}>Client</div>{panel.report.client}</div>}
                  {panel.report.lawyer && <div><div style={FILTER_LABEL}>Lawyer</div>{panel.report.lawyer}</div>}
                  {panel.report.generatedBy && <div><div style={FILTER_LABEL}>Generated By</div>{panel.report.generatedBy}</div>}
                </div>

                {panel.report.metrics && panel.report.metrics.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
                    {panel.report.metrics.map((m) => (
                      <div key={m.label} style={{ background: '#F6F2E9', border: `1px solid ${C.border}`, borderRadius: 3, padding: '10px 12px' }}>
                        <div style={FILTER_LABEL}>{m.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1A17' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {panel.report.tableRows && panel.report.tableRows.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          {panel.report.tableColumns?.map((c) => (
                            <th key={c} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${C.border}`, color: '#6E6759' }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {panel.report.tableRows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid #F1EDE0' }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {panel.report.tableRows && panel.report.tableRows.length === 0 && (
                  <div style={{ fontSize: 12.5, color: C.muted }}>No records matched this report's scope.</div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <div style={BTN_GHOST} onClick={() => setPanel(null)}>Close</div>
                  <div style={BTN_PRIMARY} onClick={() => { printReport(panel.report); setPanel(null) }}>Print / Export PDF</div>
                </div>
              </>
            )}

            {panel.mode === 'edit' && (
              <>
                <div>
                  <div style={FILTER_LABEL}>Label</div>
                  <input
                    value={editDraft.label}
                    onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                    style={{ ...SELECT_STYLE, width: '100%' }}
                  />
                </div>
                <div>
                  <div style={FILTER_LABEL}>Description</div>
                  <input
                    value={editDraft.desc}
                    onChange={(e) => setEditDraft((d) => ({ ...d, desc: e.target.value }))}
                    style={{ ...SELECT_STYLE, width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <div style={BTN_GHOST} onClick={() => setPanel(null)}>Cancel</div>
                  <div style={BTN_PRIMARY} onClick={saveEdit}>Save</div>
                </div>
              </>
            )}

            {panel.mode === 'delete' && (
              <>
                <div style={{ fontSize: 13.5, color: C.text }}>
                  This permanently removes <strong>{panel.report.label}</strong> from the report library. It cannot be undone.
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <div style={BTN_GHOST} onClick={() => setPanel(null)}>Cancel</div>
                  <div style={{ ...BTN_PRIMARY, background: C.danger, boxShadow: 'none' }} onClick={confirmDelete}>Delete permanently</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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

                  {selectedReport.generatedBy && (
                    <tr>
                      <th>Generated By</th>
                      <td>{selectedReport.generatedBy}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedReport.metrics && selectedReport.metrics.length > 0 && (
              <div className="lexflow-print-section">
                <h2>Summary</h2>
                <table>
                  <tbody>
                    {selectedReport.metrics.map((m) => (
                      <tr key={m.label}>
                        <th>{m.label}</th>
                        <td>{m.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedReport.tableRows && selectedReport.tableRows.length > 0 && (
              <div className="lexflow-print-section">
                <h2>Detail</h2>
                <table>
                  <thead>
                    <tr>
                      {selectedReport.tableColumns?.map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.tableRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => <td key={j}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

