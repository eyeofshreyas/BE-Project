import { useState } from 'react'
import { Icon, type IconName } from '../icons'
import { C } from '../theme'
import styles from '../adminShared.module.css'

type QuickAction = { label: string; icon: 'user-plus' | 'plus' | 'file-text'; primary?: boolean; onClick: () => void }

const SYSTEM_NOTIFS: { label: string; detail: string; time: string; count: number; icon: IconName; color: string; body: string }[] = [
  { label: 'Security Alerts', detail: 'Unusual login attempt blocked from a new device', time: '2m ago', count: 2, icon: 'alert-triangle', color: C.danger,
    body: 'A sign-in attempt for the admin account was blocked from an unrecognised device in Pune at 09:42 IST. The session was terminated and the IP address was added to the watchlist. Review the security log and confirm whether this was a legitimate attempt.' },
  { label: 'Failed AI Jobs', detail: 'Translation job failed for CASE-2019 — retrying', time: '25m ago', count: 3, icon: 'sparkles', color: C.warning,
    body: 'Three AI jobs failed in the last hour, including a Marathi translation for CASE-2019. The queue is retrying automatically with a lower batch size. No client-facing documents were affected.' },
  { label: 'User Registrations', detail: '14 new sign-ups today across lawyers and clients', time: '1h ago', count: 14, icon: 'user-plus', color: C.primaryDark,
    body: '14 accounts registered today: 5 lawyers and 9 clients. Four of the lawyer accounts still need Bar Council verification before they can open matters.' },
  { label: 'Upcoming Hearings', detail: '6 hearings scheduled this week', time: '3h ago', count: 6, icon: 'calendar', color: C.primaryDark,
    body: 'Six hearings are listed across the platform this week, two of them on Friday at the Bombay High Court. Reminder notifications have been queued for the assigned lawyers and their clients.' },
  { label: 'Pending Approvals', detail: '5 lawyer verification requests awaiting review', time: 'Yesterday', count: 5, icon: 'check-circle', color: C.success,
    body: 'Five lawyer verification requests are waiting on document review. The oldest has been pending for three days — approve or reject it to keep onboarding within the 48-hour service target.' },
]

const OVERVIEW_DEFS = [
  { label: 'Total Users', value: '4,812', trend: '+8.2%', icon: 'users' as const, barPct: 82 },
  { label: 'Active Lawyers', value: '386', trend: '+4.6%', icon: 'briefcase' as const, barPct: 54 },
  { label: 'Registered Clients', value: '3,940', trend: '+9.1%', icon: 'user' as const, barPct: 88 },
  { label: 'Active Cases', value: '1,204', trend: '+12.4%', icon: 'scale' as const, barPct: 66 },
  { label: 'Documents Uploaded', value: '18,540', trend: '+6.8%', icon: 'file-text' as const, barPct: 74 },
  { label: 'AI Summaries Generated', value: '9,732', trend: '+21.3%', icon: 'sparkles' as const, barPct: 90 },
  { label: 'Revenue This Month', value: '₹42.8L', trend: '+15.7%', icon: 'banknote' as const, barPct: 62 },
  { label: 'Pending Hearings', value: '217', trend: '-3.2%', icon: 'calendar' as const, barPct: 30 },
]

const ACTIVITY_DEFS = [
  { title: 'New Lawyer Registered', desc: 'Adv. Sanjana Rao joined as a corporate lawyer', time: '12m ago', icon: 'user-plus' as const },
  { title: 'Client Created', desc: 'Deepak Malhotra added as a new client', time: '38m ago', icon: 'user' as const },
  { title: 'Document Uploaded', desc: 'Sale Deed uploaded to CASE-2041', time: '1h ago', icon: 'file-text' as const },
  { title: 'AI Summary Generated', desc: 'Summary ready for CASE-2035', time: '2h ago', icon: 'sparkles' as const },
  { title: 'Case Assigned', desc: 'CASE-2029 assigned to Adv. Rohan Bhatt', time: '3h ago', icon: 'scale' as const },
  { title: 'Invoice Generated', desc: 'INV-2026-0318 sent to Verma Textiles', time: '5h ago', icon: 'receipt' as const },
  { title: 'Hearing Scheduled', desc: 'CASE-2022 hearing set for 25 Aug 2026', time: 'Yesterday', icon: 'calendar' as const },
]

export default function DashboardView({ quickActions }: { quickActions: QuickAction[] }) {
  const [selectedNotif, setSelectedNotif] = useState<number | null>(null)
  const detail = selectedNotif != null ? SYSTEM_NOTIFS[selectedNotif] : null

  return (
    <>
      <div className={styles.pageHeadRow}>
        <div>
          <div className={styles.pageTitle}>Welcome back, Priya</div>
          <div className={styles.pageSubtitle}>Monitor users, legal cases, documents, AI activity, and overall platform performance from one centralized dashboard.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {quickActions.map((qa) => (
            <div
              key={qa.label}
              className={styles.chipBase}
              style={{ color: qa.primary ? '#FFFFFF' : '#3D3126', background: qa.primary ? C.primary : '#FFFFFF', border: qa.primary ? 'none' : `1px solid ${C.border}` }}
              onClick={qa.onClick}
            >
              <Icon name={qa.icon} size={15} color={qa.primary ? '#FFFFFF' : C.primaryDark} /><span>{qa.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        {OVERVIEW_DEFS.map((c) => (
          <div key={c.label} style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(158deg,#FFFFFF 0%,#FDF7EA 100%)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '15px 16px 13px', display: 'flex', flexDirection: 'column', gap: 11, boxShadow: '0 1px 2px rgba(42,33,24,.05)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#B08D3E,#8f6743)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#F6EDDC 0%,#EFE4CB 100%)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={c.icon} size={18} color={C.primaryDark} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10.5, color: '#8C7C5E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 25, fontWeight: 700, color: '#2A2118', lineHeight: 1, letterSpacing: '-.02em' }}>{c.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.primaryDark, background: '#EFE3D2', border: `1px solid ${C.border}`, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{c.trend}</div>
                </div>
              </div>
            </div>
            <div style={{ height: 3, borderRadius: 3, background: '#F1E7D3', overflow: 'hidden' }}>
              <div style={{ width: `${c.barPct}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#C9A47C,#B08D3E)' }} />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className={styles.sectionTitle} style={{ marginBottom: 14 }}>Recent Activity</div>
        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 18, padding: '10px 22px', boxShadow: '0 1px 2px rgba(42,33,24,.04)', display: 'flex', flexDirection: 'column' }}>
          {ACTIVITY_DEFS.map((a, i) => (
            <div key={a.title} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i === ACTIVITY_DEFS.length - 1 ? 'none' : '1px solid #F1E9D9' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#EFE4CB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={a.icon} size={14} color={C.primaryDark} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2A2118' }}>{a.title}</div>
                <div style={{ fontSize: 12, color: '#8C7C5E', marginTop: 2, lineHeight: 1.4 }}>{a.desc}</div>
                <div style={{ fontSize: 11, color: '#A38F66', marginTop: 4 }}>{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>System Notifications</div>
        <div style={{ fontSize: 13, color: '#8C7C5E', margin: '4px 0 14px' }}>Security alerts, AI job failures, sign-ups and approvals awaiting review.</div>
        <div style={{ display: 'grid', gridTemplateColumns: detail ? '340px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(42,33,24,.04)' }}>
            <div style={{ padding: '13px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C7C5E', borderBottom: `1px solid ${C.border}` }}>All notifications</div>
            {SYSTEM_NOTIFS.map((n, i) => (
              <div
                key={n.label}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: i === SYSTEM_NOTIFS.length - 1 ? 'none' : '1px solid #F0E8D8', background: selectedNotif === i ? '#FCF6EA' : 'transparent' }}
                onClick={() => setSelectedNotif(i)}
              >
                <div style={{ width: 30, height: 30, borderRadius: 9, background: n.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={n.icon} size={15} color={n.color} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#2A2118', lineHeight: 1.45, fontWeight: selectedNotif === i ? 600 : 500 }}>{n.detail}</div>
                  <div style={{ fontSize: 11, color: '#A38F66', marginTop: 4 }}>{n.time}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: n.color, background: n.color + '1f', borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>{n.count}</span>
              </div>
            ))}
          </div>
          {detail && (
            <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 18, padding: 28, boxShadow: '0 1px 2px rgba(42,33,24,.04)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: detail.color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={detail.icon} size={20} color={detail.color} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 21, fontWeight: 700, color: '#2A2118', lineHeight: 1.35 }}>{detail.detail}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11.5, color: '#A38F66' }}>{detail.time}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6A5C42', background: '#EFE4CB', padding: '4px 9px', borderRadius: 20 }}>{detail.label}</div>
                    <div style={{ fontSize: 11, color: '#8C7C5E' }}>{detail.count} {detail.count === 1 ? 'item' : 'items'}</div>
                  </div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} onClick={() => setSelectedNotif(null)}><Icon name="x" size={15} color="#8C7C5E" /></div>
              </div>
              <div style={{ height: 1, background: '#F0E8D8' }} />
              <div style={{ fontSize: 13.5, color: '#4A3F2E', lineHeight: 1.6 }}>{detail.body}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: '#8C7C5E' }}>AI-Assisted Legal Workflow and Document Intelligence Platform</div>
        <div style={{ fontSize: 11.5, color: '#A38F66', marginTop: 4 }}>© 2026 LexFlow Technologies</div>
      </div>
    </>
  )
}
