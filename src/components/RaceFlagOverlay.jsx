/**
 * RaceFlagOverlay — 2 drapeaux à damier façon départ de course
 *
 * Approche : tissu CSS pur (background damier + perspective + skew + rotate),
 * pas de SVG filter complexe — le résultat est plus lisible qu'un noise
 * displacement et tourne sans effort sur mobile.
 *
 * Deux modes :
 *  - 'pre-race'  : "DÉPART IMMINENT" (session.status='live' & !started_at)
 *  - 'post-race' : "FIN DE LA COURSE" + countdown 5min + auto-exit
 *
 * Croix ✕ en haut à droite pour quitter le live à tout moment.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './RaceFlagOverlay.css'

const POST_RACE_DURATION_MS = 5 * 60 * 1000

const formatRemaining = (ms) => {
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Drapeau : un mât + un tissu damier en perspective qui ondule.
function Flag({ side }) {
  return (
    <div className={`race-flag race-flag-${side}`}>
      <div className="race-flag-mast" />
      <div className="race-flag-mast-knob" />
      <div className="race-flag-fabric-perspective">
        <div className="race-flag-fabric" />
      </div>
    </div>
  )
}

export default function RaceFlagOverlay({ mode, session, onAutoExit, onClose }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (mode !== 'post-race') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [mode])

  const finishedAt = session?.finished_at ? new Date(session.finished_at).getTime() : null
  const exitTime = finishedAt ? finishedAt + POST_RACE_DURATION_MS : null
  const remaining = (mode === 'post-race' && exitTime) ? exitTime - now : 0

  useEffect(() => {
    if (mode !== 'post-race') return
    if (!exitTime) {
      const fallbackTimer = setTimeout(() => onAutoExit?.(), POST_RACE_DURATION_MS)
      return () => clearTimeout(fallbackTimer)
    }
    const delay = Math.max(0, exitTime - Date.now())
    const timer = setTimeout(() => onAutoExit?.(), delay)
    return () => clearTimeout(timer)
  }, [mode, exitTime, onAutoExit])

  if (mode !== 'pre-race' && mode !== 'post-race') return null

  const isPre = mode === 'pre-race'

  const handleClose = () => {
    if (onClose) onClose()
    else if (onAutoExit) onAutoExit()
  }

  return createPortal(
    <div className={`race-flag-overlay ${isPre ? 'is-pre' : 'is-post'}`}>
      {/* Croix de sortie */}
      <button
        type="button"
        className="race-flag-close-btn"
        onClick={handleClose}
        aria-label="Quitter le live"
        title="Quitter le live"
      >
        ✕
      </button>

      {/* Fond + vignette */}
      <div className="race-flag-bg" />
      <div className="race-flag-vignette" />

      {/* 2 drapeaux */}
      <Flag side="left" />
      <Flag side="right" />

      {/* Contenu central */}
      <div className="race-flag-content">
        {isPre ? (
          <>
            <div className="race-flag-eyebrow">🏁 PRÊT À PARTIR</div>
            <h1 className="race-flag-title">Départ imminent</h1>
            <p className="race-flag-sub">
              Le chrono démarre dans quelques instants…
            </p>
            <div className="race-flag-pulse-dots">
              <span /><span /><span />
            </div>
          </>
        ) : (
          <>
            <div className="race-flag-eyebrow">🏁 LIGNE D'ARRIVÉE</div>
            <h1 className="race-flag-title">Fin de la course</h1>
            <p className="race-flag-sub">
              Merci d'avoir suivi le live ! Les résultats sont consolidés.
            </p>
            <div className="race-flag-countdown">
              <span className="race-flag-countdown-label">Retour à l'accueil dans</span>
              <span className="race-flag-countdown-time">{formatRemaining(remaining)}</span>
            </div>
            <button
              className="btn btn-ghost race-flag-exit-now"
              onClick={() => onAutoExit?.()}
            >
              Quitter maintenant
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
