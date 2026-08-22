type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number }

export type IconName =
  | 'grid' | 'users' | 'briefcase' | 'user' | 'user-plus' | 'scale' | 'file-text' | 'sparkles'
  | 'calendar' | 'bar-chart-2' | 'pie-chart' | 'bell' | 'settings' | 'log-out' | 'search'
  | 'chevron-down' | 'plus' | 'download' | 'receipt' | 'banknote' | 'alert-triangle'
  | 'check-circle' | 'database' | 'server' | 'hard-drive' | 'eye' | 'edit' | 'ban'
  | 'trash-2' | 'mail' | 'phone' | 'shield' | 'palette' | 'info' | 'x'

export function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.8 }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'grid': return <svg {...common}><rect x={3} y={3} width={8} height={8} rx={2} /><rect x={13} y={3} width={8} height={8} rx={2} /><rect x={3} y={13} width={8} height={8} rx={2} /><rect x={13} y={13} width={8} height={8} rx={2} /></svg>
    case 'users': return <svg {...common}><circle cx={9} cy={8} r={3} /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx={17} cy={9} r={2.5} /><path d="M21 20c0-2.5-1.8-4.6-4.2-5.4" /></svg>
    case 'briefcase': return <svg {...common}><rect x={3} y={8} width={18} height={12} rx={2} /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    case 'user': return <svg {...common}><circle cx={12} cy={8} r={4} /><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
    case 'user-plus': return <svg {...common}><circle cx={9} cy={7} r={4} /><path d="M2 21c0-4 3-7 7-7" /><path d="M19 8v6" /><path d="M16 11h6" /></svg>
    case 'scale': return <svg {...common}><path d="M12 3v18" /><path d="M7 6h10" /><path d="M4 6l3 6a3 3 0 0 0 6 0L10 6" /><path d="M14 6l3 6a3 3 0 0 0 6 0L20 6" /></svg>
    case 'file-text': return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></svg>
    case 'sparkles': return <svg {...common}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M19 15l.6 1.8 1.9.6-1.9.6L19 20l-.6-2-1.9-.6 1.9-.6z" /></svg>
    case 'calendar': return <svg {...common}><rect x={3} y={5} width={18} height={16} rx={2} /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
    case 'bar-chart-2': return <svg {...common}><rect x={4} y={10} width={4} height={10} rx={1} /><rect x={10} y={4} width={4} height={16} rx={1} /><rect x={16} y={13} width={4} height={7} rx={1} /></svg>
    case 'pie-chart': return <svg {...common}><path d="M21 12A9 9 0 1 1 12 3v9z" /><circle cx={12} cy={12} r={9} /></svg>
    case 'bell': return <svg {...common}><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
    case 'settings': return <svg {...common}><circle cx={12} cy={12} r={3} /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
    case 'log-out': return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
    case 'search': return <svg {...common}><circle cx={11} cy={11} r={7} /><path d="M21 21l-4.3-4.3" /></svg>
    case 'chevron-down': return <svg {...common}><polyline points="6 9 12 15 18 9" /></svg>
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'download': return <svg {...common}><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
    case 'receipt': return <svg {...common}><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></svg>
    case 'banknote': return <svg {...common}><rect x={2} y={6} width={20} height={12} rx={2} /><circle cx={12} cy={12} r={2.5} /><path d="M6 10v.01M18 14v.01" /></svg>
    case 'alert-triangle': return <svg {...common}><path d="M12 3l9 16H3z" /><path d="M12 9v4" /><path d="M12 16h.01" /></svg>
    case 'check-circle': return <svg {...common}><path d="M9 12l2 2 4-4" /><circle cx={12} cy={12} r={9} /></svg>
    case 'database': return <svg {...common}><ellipse cx={12} cy={5} rx={8} ry={3} /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
    case 'server': return <svg {...common}><rect x={3} y={4} width={18} height={6} rx={1.5} /><rect x={3} y={14} width={18} height={6} rx={1.5} /><circle cx={7} cy={7} r={0.6} fill="currentColor" /><circle cx={7} cy={17} r={0.6} fill="currentColor" /></svg>
    case 'hard-drive': return <svg {...common}><rect x={2} y={11} width={20} height={8} rx={2} /><path d="M4 11l3-7h10l3 7" /><circle cx={8} cy={15} r={1} fill="currentColor" /></svg>
    case 'eye': return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx={12} cy={12} r={3} /></svg>
    case 'edit': return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
    case 'ban': return <svg {...common}><circle cx={12} cy={12} r={9} /><path d="M5.5 5.5l13 13" /></svg>
    case 'trash-2': return <svg {...common}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>
    case 'mail': return <svg {...common}><rect x={3} y={5} width={18} height={14} rx={2} /><path d="M3 6l9 7 9-7" /></svg>
    case 'phone': return <svg {...common}><path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2C9.5 19 5 14.5 5 8a2 2 0 0 1 1-2z" /></svg>
    case 'shield': return <svg {...common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
    case 'palette': return <svg {...common}><path d="M12 3a9 9 0 1 0 .3 18c1.2 0 1.9-.9 1.9-1.9 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-1.9 1.9-1.9H17a4 4 0 0 0 4-4c0-4.6-4-7.4-9-7.4z" /><circle cx={7.5} cy={10.5} r={1.2} /><circle cx={11} cy={7.5} r={1.2} /><circle cx={15} cy={8.5} r={1.2} /></svg>
    case 'info': return <svg {...common}><circle cx={12} cy={12} r={9} /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
    case 'x': return <svg {...common}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
  }
}
