/**
 * Toast — Système de notifications non-bloquantes
 *
 * Remplace les alert() / confirm() natifs qui bloquent le JS, sont moches
 * sur mobile, et peuvent être bloqués par certains navigateurs après
 * plusieurs appels d'affilée.
 *
 * Usage :
 *   const toast = useToast()
 *   toast.success('Achat enregistré !')
 *   toast.error("Échec de l'upload")
 *   toast.info('Connexion au live...')
 *   const ok = await toast.confirm('Supprimer ce rider ?')
 *
 * Le ToastProvider doit envelopper l'app dans main.jsx.
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Toast.css'

const ToastContext = createContext(null)

const DEFAULT_DURATION = 4000
const ERROR_DURATION = 6000

let _idCounter = 0
const nextId = () => `t-${Date.now()}-${++_idCounter}`

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // confirmResolvers : map de toastId → resolver Promise pour les confirm()
  const confirmResolvers = useRef(new Map())

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const resolver = confirmResolvers.current.get(id)
    if (resolver) {
      resolver(false) // fermeture sans choix = annulation
      confirmResolvers.current.delete(id)
    }
  }, [])

  const push = useCallback((toast) => {
    const id = nextId()
    const t = { id, ...toast }
    setToasts(prev => [...prev, t])
    if (toast.kind !== 'confirm' && toast.duration !== Infinity) {
      const duration = toast.duration ||
        (toast.kind === 'error' ? ERROR_DURATION : DEFAULT_DURATION)
      setTimeout(() => remove(id), duration)
    }
    return id
  }, [remove])

  const api = {
    success: (message, opts) => push({ kind: 'success', message, ...opts }),
    error:   (message, opts) => push({ kind: 'error',   message, ...opts }),
    info:    (message, opts) => push({ kind: 'info',    message, ...opts }),
    warning: (message, opts) => push({ kind: 'warning', message, ...opts }),
    confirm: (message, opts = {}) => new Promise(resolve => {
      const id = push({
        kind: 'confirm',
        message,
        confirmLabel: opts.confirmLabel || 'Confirmer',
        cancelLabel:  opts.cancelLabel  || 'Annuler',
        dangerous:    !!opts.dangerous,
        duration: Infinity,
      })
      confirmResolvers.current.set(id, resolve)
    }),
    dismiss: remove,
  }

  const handleConfirmChoice = (id, choice) => {
    const resolver = confirmResolvers.current.get(id)
    if (resolver) {
      resolver(choice)
      confirmResolvers.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.kind} ${t.dangerous ? 'toast-danger' : ''}`}>
              <span className="toast-icon" aria-hidden="true">
                {t.kind === 'success' && '✓'}
                {t.kind === 'error'   && '✕'}
                {t.kind === 'warning' && '⚠'}
                {t.kind === 'info'    && 'ℹ'}
                {t.kind === 'confirm' && '?'}
              </span>
              <span className="toast-message">{t.message}</span>
              {t.kind === 'confirm' ? (
                <div className="toast-actions">
                  <button
                    type="button"
                    className="toast-btn toast-btn-ghost"
                    onClick={() => handleConfirmChoice(t.id, false)}
                  >
                    {t.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className={`toast-btn ${t.dangerous ? 'toast-btn-danger' : 'toast-btn-primary'}`}
                    onClick={() => handleConfirmChoice(t.id, true)}
                  >
                    {t.confirmLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => remove(t.id)}
                  aria-label="Fermer"
                >×</button>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback gracieux pendant le SSR ou si l'app oublie le Provider :
    // on retombe sur alert/confirm — pas génial mais évite un crash.
    return {
      success: (m) => alert(m),
      error:   (m) => alert(m),
      info:    (m) => alert(m),
      warning: (m) => alert(m),
      confirm: (m) => Promise.resolve(window.confirm(m)),
      dismiss: () => {},
    }
  }
  return ctx
}
