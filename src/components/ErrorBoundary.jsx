import { Component } from 'react'

// Wraps the app so any uncaught render error shows a recoverable screen instead of a blank page.
// The "Réinitialiser" button clears the localStorage keys that drive view state, which is the
// usual culprit when a stale persisted state crashes a component after a deploy.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }

  handleReset = () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('myd_'))
        .forEach(k => localStorage.removeItem(k))
    } catch {
      // Ignore: localStorage unavailable (private mode etc.)
    }
    window.location.href = '/'
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#fff',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          maxWidth: 520,
          textAlign: 'center',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,85,0,0.4)',
          borderRadius: 16,
          padding: '32px 28px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🛠️</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Oups, le site a buggé</h1>
          <p style={{ opacity: 0.8, lineHeight: 1.5, fontSize: 14 }}>
            Une erreur a interrompu l'affichage. La plupart du temps, cliquer sur
            <strong> Réinitialiser </strong> suffit (ça efface les préférences locales sans
            toucher à ton compte).
          </p>
          {this.state.error?.message && (
            <pre style={{
              textAlign: 'left',
              background: '#000',
              padding: 10,
              borderRadius: 8,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 120,
              margin: '12px 0',
              opacity: 0.7,
            }}>
              {String(this.state.error.message)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={this.handleReload} style={{
              padding: '10px 18px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}>
              Recharger
            </button>
            <button onClick={this.handleReset} style={{
              padding: '10px 18px',
              background: '#ff5500',
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}>
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    )
  }
}
