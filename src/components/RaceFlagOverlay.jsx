/**
 * RaceFlagOverlay — Drapeau à damier fullscreen avec mouvement organique
 *
 * Deux modes :
 *  - 'pre-race'  : "DÉPART IMMINENT" — affiché quand la session est créée
 *                  (status='live') mais started_at est null. Disparait dès
 *                  que l'orga lance le chrono.
 *  - 'post-race' : "FIN DE LA COURSE" — affiché quand status='finished'/
 *                  'published'. Décompte de 5 minutes à partir de finished_at
 *                  puis appelle onAutoExit pour fermer la page live.
 *
 * Le drapeau est un pattern damier + filtre SVG feTurbulence + feDisplacementMap
 * animé, ce qui produit un effet "billowing" organique sans canvas ni vidéo.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './RaceFlagOverlay.css'

const POST_RACE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

const formatRemaining = (ms) => {
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RaceFlagOverlay({ mode, session, onAutoExit, onClose }) {
  const [now, setNow] = useState(() => Date.now())

  // Ticker pour rafraichir le compteur post-race chaque seconde
  useEffect(() => {
    if (mode !== 'post-race') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [mode])

  // Calcul du temps restant et trigger de l'auto-exit
  const finishedAt = session?.finished_at ? new Date(session.finished_at).getTime() : null
  const exitTime = finishedAt ? finishedAt + POST_RACE_DURATION_MS : null
  const remaining = (mode === 'post-race' && exitTime) ? exitTime - now : 0

  useEffect(() => {
    if (mode !== 'post-race') return
    if (!exitTime) {
      // Pas de finished_at → on prend now() comme référence de secours
      // (ne devrait pas arriver en théorie)
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
      {/* Croix de sortie en haut à droite — toujours accessible */}
      <button
        type="button"
        className="race-flag-close-btn"
        onClick={handleClose}
        aria-label="Quitter le live"
        title="Quitter le live"
      >
        ✕
      </button>

      {/* Filtre SVG : turbulence + displacement = effet "billowing" du drapeau */}
      <svg className="race-flag-svg-defs" aria-hidden="true">
        <defs>
          <filter id="race-flag-wave" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="3"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="14s"
                values="0.012 0.018; 0.020 0.024; 0.012 0.018"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="32"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Couche damier (le drapeau lui-même) */}
      <div className="race-flag-canvas">
        <div className="race-flag-pattern" />
      </div>

      {/* Vignette pour la profondeur */}
      <div className="race-flag-vignette" />

      {/* Texte principal */}
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
