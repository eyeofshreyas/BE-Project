/** Root-level fallback for an uncaught render error -- without this, any component throwing
 * (e.g. a null reference on a field the backend didn't return) white-screens the whole SPA
 * with no feedback. React only supports this via a class component's static lifecycle hook,
 * not a plain function component. */
import { Component, type ErrorInfo, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
        background: 'var(--lf-bg)', color: 'var(--lf-text)', fontFamily: "'Public Sans', sans-serif",
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</div>
        <div style={{ fontSize: 13.5, color: 'var(--lf-muted)', maxWidth: 420 }}>
          This page hit an unexpected error. Reloading usually fixes it; if it keeps
          happening, contact support.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--lf-primary)', color: '#fff', fontSize: 13.5, fontWeight: 600,
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
