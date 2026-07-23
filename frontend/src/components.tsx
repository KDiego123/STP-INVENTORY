import type { ReactNode } from 'react'

export function Loader({ label = 'Cargando información…' }: { label?: string }) {
  return <div className="loader"><span className="spinner" />{label}</div>
}

export function EmptyState({ icon = '⌕', title, text }: { icon?: string; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>
}

export function Modal({ title, subtitle, children, onClose, wide = false, compact = false }: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  compact?: boolean
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''} ${compact ? 'modal-compact' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><p className="eyebrow">Gestión administrativa</p><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="notice notice-error"><span>!</span><div><strong>No pudimos completar la operación</strong><p>{message}</p></div>{onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Reintentar</button>}</div>
}

export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) {
  return <div className={`toast toast-${type}`}><span>{type === 'success' ? '✓' : '!'}</span><p>{message}</p><button onClick={onClose}>×</button></div>
}

export const formatNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(Number(value))
}

export const formatDate = (value: string | null | undefined, withTime = false) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' }).format(new Date(value))
}
