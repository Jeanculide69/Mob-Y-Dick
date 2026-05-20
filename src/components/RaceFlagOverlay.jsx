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
 * Visuel : DEUX drapeaux à damier façon "podium course" — un de chaque
 * côté du titre, sur leurs mâts, ondulés par un filtre SVG feTurbulence
 * + feDisplacementMap pour un mouvement organique (pas mécanique).
 *
 * Bouton ✕ en haut à droite pour quitter le live (visible dans les deux
 * modes — le post-race a aussi son bouton "Quitter maintenant" qui fait
 * la même chose).
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

// SVG : un drapeau (mât + tissu damier ondulé). On en place 2 (gauche/droit
// miroirs) dans le composant.
function FlagSVG({ side }) {
  const isLeft = side === 'left'
  // Pour chaque côté on utilise un filtre dédié (seeds différents)
  // pour que les deux drapeaux ne soient pas synchronisés visuellement.
  const filterId = isLeft ? 'race-flag-wave-left' : 'race-flag-wave-right'
  const patternId = isLeft ? 'race-flag-checker-left' : 'race-flag-checker-right'
  return (
    <svg
      className={`race-flag-svg race-flag-svg-${side}`}
      viewBox="0 0 360 280"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#1a1a1a" />
          <rect x="24" y="24" width="24" height="24" fill="#1a1a1a" />
          <rect x="24" y="0" width="24" height="24" fill="#f7f7f7" />
          <rect x="0" y="24" width="24" height="24" fill="#f7f7f7" />
        </pattern>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.028"
            numOctaves="2"
            seed={isLeft ? '3' : '7'}
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur={isLeft ? '11s' : '14s'}
              values="0.018 0.028; 0.030 0.040; 0.018 0.028"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="42"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        {/* Dégradé sur le mât pour un peu de relief */}
        <linearGradient id={`mast-grad-${side}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#444" />
          <stop offset="50%" stopColor="#aaa" />
          <stop offset="100%" stopColor="#666" />
        </linearGradient>
      </defs>

      {/* Mât */}
      <rect
        x={isLeft ? 0 : 354}
        y="0"
        width="6"
        height="280"
        fill={`url(#mast-grad-${side})`}
        rx="2"
      />
      {/* Pommeau du mât */}
      <circle
        cx={isLeft ? 3 : 357}
        cy="6"
        r="9"
        fill={`url(#mast-grad-${side})`}
      />

      {/* Tissu du drapeau avec filtre wave */}
      <g filter={`url(#${filterId})`}>
        <rect
          x={isLeft ? 8 : 56}
          y="14"
          width="296"
          height="170"
          fill={`url(#${patternId})`}
        />
        {/* Petit rebord d'ombre sur le tissu pour le relief */}
        <rect
          x={isLeft ? 8 : 56}
          y="14"
          width="296"
          height="170"
          fill="none"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="2"
        />
      </g>
    </svg>
  )
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
      const fallbackTimer = setTimeout(() => onAutoExit?.(), POST_RACE_DURATION_MS)
      return () => clearTimeout(fallbackTimer)
    }
    const delay = Math.max(0, exitTime - Date.now())
    const timer = setTimeout(() => onAutoExit?.(), delay)
    return () => clearTimeout(timer)
  }, [mode, exitTime, onAutoExit])

  if (mode !== 'pre-race' && mode !== 'post-race') return null

  const isPre = mode === 'pre-race'

  // Pour le bouton X : on essaie onClose en priorité, sinon onAutoExit
  const handleClose = () => {
    if (onClose) onClose()
    else if (onAutoExit) onAutoExit()
  }

  return createPortal(
    <div className={`race-flag-overlay ${isPre ? 'is-pre' : 'is-post'}`}>
      {/* Croix de sortie en haut à droite — toujours visible */}
      <button
        type="button"
        className="race-flag-close-btn"
        onClick={handleClose}
        aria-label="Quitter le live"
        title="Quitter le live"
      >
        ✕
      </button>

      {/* Fond dégradé sombre + vignette */}
      <div className="race-flag-bg" />
      <div className="race-flag-vignette" />

      {/* 2 drapeaux SVG, un de chaque côté du titre */}
      <div className="race-flag-flags-wrap">
        <FlagSVG side="left" />
        <FlagSVG side="right" />
      </div>

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
