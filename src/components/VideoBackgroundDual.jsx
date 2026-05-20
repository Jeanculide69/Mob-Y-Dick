/**
 * VideoBackgroundDual — Boucle vidéo de fond sans artefact
 *
 * Stratégie : deux <video loop muted> stackées, fondu enchaîné.
 *
 *   A (visible) ───────────────── fin proche ─→ fade out
 *                                   ↓
 *   B (paused, opacity 0) ─ B.currentTime=0 + play + fade in
 *                                   ↓
 *                   La couture de loop de A se produit
 *                   pendant son fade out → invisible
 *
 * À l'inverse quand B approche de sa fin, on bascule sur A.
 * La vidéo non visible est mise en pause pour économiser le CPU
 * pendant les ~D secondes où elle ne sert à rien (D = durée vidéo).
 *
 * Aucune RAM accumulée, aucun seek, décodage GPU natif.
 */
import { useEffect, useRef } from 'react'

const FADE_DURATION_SEC = 1.5
const FADE_DURATION_MS  = FADE_DURATION_SEC * 1000

export default function VideoBackgroundDual({ src }) {
  const refA = useRef(null)
  const refB = useRef(null)

  useEffect(() => {
    const a = refA.current
    const b = refB.current
    if (!a || !b) return

    a.style.opacity = '1'
    b.style.opacity = '0'

    let currentVisible = a
    let pauseTimer = null

    // Le partenaire (la vidéo NON visible) est paused jusqu'à ce
    // qu'on en ait besoin pour le crossfade.
    const triggerCrossfade = (from, to) => {
      // Préchauffe la cible : seek 0 puis play.
      try { to.currentTime = 0 } catch { /* ignore */ }
      to.play().catch(() => {})
      to.style.opacity = '1'
      from.style.opacity = '0'
      currentVisible = to
      // Pause la vidéo qui s'efface dès qu'elle est invisible
      // (un peu après la fin de la transition CSS)
      if (pauseTimer) clearTimeout(pauseTimer)
      pauseTimer = setTimeout(() => {
        // Si entretemps on a re-basculé, ne rien faire
        if (currentVisible !== from) {
          try { from.pause() } catch { /* ignore */ }
        }
      }, FADE_DURATION_MS + 80)
    }

    const onTimeUpdate = (e) => {
      const el = e.target
      if (el !== currentVisible) return  // seule la visible déclenche le fade
      if (!el.duration || isNaN(el.duration)) return
      const remaining = el.duration - el.currentTime
      if (remaining < FADE_DURATION_SEC) {
        const partner = (el === a) ? b : a
        triggerCrossfade(el, partner)
      }
    }

    a.addEventListener('timeupdate', onTimeUpdate)
    b.addEventListener('timeupdate', onTimeUpdate)

    // Démarre A
    a.play().catch(() => {})

    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate)
      b.removeEventListener('timeupdate', onTimeUpdate)
      if (pauseTimer) clearTimeout(pauseTimer)
    }
  }, [])

  return (
    <>
      <video
        ref={refA}
        className="video-bg-layer"
        muted
        loop
        playsInline
        preload="auto"
        autoPlay
      >
        <source src={src} type="video/mp4" />
      </video>
      <video
        ref={refB}
        className="video-bg-layer"
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src={src} type="video/mp4" />
      </video>
    </>
  )
}
