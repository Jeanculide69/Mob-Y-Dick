/**
 * premiumEmoteEffects — Confetti + screen shake par emote premium
 *
 * Source d'inspiration : Design/Emotes/PremiumEmotesTest.html
 *
 * Pour chaque slug, on déclenche :
 *   - Un ou plusieurs bursts confetti (via canvas-confetti)
 *   - Un screen shake (light / heavy / null) appliqué sur document.body
 *
 * La classe d'animation CSS qui anime l'image elle-même (poopDropHD,
 * slideInHonk…) est gérée séparément côté LiveRace via `animClass`.
 *
 * KLAXON SPÉCIFIQUE : on override le visuel et le son avec les assets
 * locaux livrés dans /public/emotes/ — le slug `sound_horn` n'utilise
 * pas la photo/son Supabase pour cet effet (cf. MEDIA_OVERRIDES).
 */
import confetti from 'canvas-confetti'

// ─── Helpers ───
const fireSequence = (configs, totalMs) => {
  // Tire plusieurs bursts en série sur `totalMs` ms.
  configs.forEach((cfg, i) => {
    setTimeout(() => { try { confetti(cfg) } catch { /* ignore */ } },
               Math.round((i / Math.max(1, configs.length - 1)) * totalMs))
  })
}

const fireStream = (factory, durationMs) => {
  // Lance un flux continu via requestAnimationFrame.
  const end = performance.now() + durationMs
  const frame = () => {
    if (performance.now() >= end) return
    try { confetti(factory()) } catch { /* ignore */ }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

const shakeScreen = (level) => {
  if (!level) return
  const cls = level === 'heavy' ? 'shake-heavy' : 'shake-screen'
  const duration = level === 'heavy' ? 1000 : 500
  document.body.classList.add(cls)
  setTimeout(() => document.body.classList.remove(cls), duration)
}

// ─── Effets par slug ───
// Chaque fonction est appelée quand l'emote devient visible (head de queue).
const EFFECTS = {
  emote_poop: () => {
    setTimeout(() => {
      try { confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 },
        colors: ['#4a3018', '#634222', '#1cf71c'], startVelocity: 30, gravity: 1.5, scalar: 1.2 }) } catch {}
    }, 600)
  },

  emote_fart: () => {
    fireStream(() => ({
      particleCount: 3, angle: Math.random() * 360, spread: 360,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#00ff00', '#33cc33', '#66ff66'],
      shapes: ['circle'], gravity: -0.05, scalar: 3, ticks: 100, zIndex: 9998,
    }), 2500)
  },

  sound_horn: () => {
    setTimeout(() => {
      try { confetti({ particleCount: 150, angle: 0, spread: 60, origin: { x: 0.2, y: 0.5 },
        colors: ['#ffaa00', '#ffffff', '#ff0000'], startVelocity: 45, scalar: 1.5 }) } catch {}
    }, 500)
  },

  emote_clown: () => {
    shakeScreen('light')
    setTimeout(() => {
      try { confetti({ particleCount: 100, spread: 360, origin: { x: 0.5, y: 0.5 },
        colors: ['#ff0000', '#000000', '#550000'], startVelocity: 50, gravity: 0.5, scalar: 2 }) } catch {}
    }, 200)
  },

  emote_fire: () => {
    fireStream(() => ({
      particleCount: 15, angle: 90, spread: 90, origin: { x: 0.5, y: 0.9 },
      colors: ['#ff0000', '#ff5500', '#ffaa00', '#ffff00'],
      startVelocity: 60 + Math.random() * 40, gravity: 0.1,
      scalar: 1.5 + Math.random() * 2, decay: 0.85,
    }), 2500)
  },

  emote_wheelie: () => {
    // Fumée derrière la roue : flux continu de particules grises
    fireStream(() => ({
      particleCount: 5, angle: 180, spread: 45, origin: { x: 0.5, y: 0.6 },
      colors: ['#cccccc', '#aaaaaa', '#ffffff'], shapes: ['circle'],
      gravity: -0.1, scalar: 2, ticks: 50, zIndex: 9998,
    }), 2500)
  },

  emote_crash: () => {
    shakeScreen('heavy')
    const count = 200
    const defaults = { origin: { y: 0.5 }, zIndex: 9999 }
    fireSequence([
      { ...defaults, spread: 26, startVelocity: 55, colors: ['#ff0000', '#ff7700'], particleCount: Math.floor(count * 0.25) },
      { ...defaults, spread: 60, colors: ['#000000', '#333333'], particleCount: Math.floor(count * 0.2) },
      { ...defaults, spread: 100, decay: 0.91, scalar: 0.8, colors: ['#ffaa00', '#ffff00'], particleCount: Math.floor(count * 0.35) },
      { ...defaults, spread: 120, startVelocity: 45, colors: ['#ff5500'], particleCount: Math.floor(count * 0.1) },
    ], 50)
  },

  emote_trophy: () => {
    // Confettis dorés sortant des deux côtés pendant 4.5s
    fireStream(() => {
      try { confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 },
        colors: ['#ffd700', '#ffaa00', '#ffffff'] }) } catch {}
      return { particleCount: 3, angle: 120, spread: 55, origin: { x: 1 },
        colors: ['#ffd700', '#ffaa00', '#ffffff'] }
    }, 4500)
  },

  sound_airhorn: () => {
    setTimeout(() => {
      shakeScreen('light')
      try { confetti({ particleCount: 150, angle: 90, spread: 180, origin: { x: 0.5, y: 0.5 },
        colors: ['#ffffff', '#cccccc'], startVelocity: 60, decay: 0.9, scalar: 1.5 }) } catch {}
    }, 300)
  },

  emote_rooster: () => {
    // Plumes / boue projetées en continu pendant 3s
    fireStream(() => ({
      particleCount: 2, angle: Math.random() * 360, spread: 30,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#444444', '#ff0000', '#888888'], shapes: ['circle'],
      gravity: 1, scalar: 1.2, zIndex: 9998,
    }), 3000)
  },

  emote_laughcry: () => {
    // Larmes des deux yeux qui tombent
    fireStream(() => {
      try { confetti({ particleCount: 2, angle: 270, spread: 45, origin: { x: 0.45, y: 0.5 },
        colors: ['#ff0000', '#ff8800'], gravity: 1.5, scalar: 1.5 }) } catch {}
      return { particleCount: 2, angle: 270, spread: 45, origin: { x: 0.55, y: 0.5 },
        colors: ['#ff0000', '#ff8800'], gravity: 1.5, scalar: 1.5 }
    }, 2500)
  },

  emote_mindblown: () => {
    shakeScreen('heavy')
    setTimeout(() => {
      const count = 300
      const defaults = { origin: { x: 0.5, y: 0.35 }, zIndex: 9999, startVelocity: 60 }
      try {
        confetti({ ...defaults, particleCount: count * 0.4, spread: 120, angle: 90,
          colors: ['#ff5500', '#ff0000', '#ffaa00'] })
        confetti({ ...defaults, particleCount: count * 0.4, spread: 160, angle: 90,
          colors: ['#444444', '#888888', '#aaaaaa'], shapes: ['circle'], scalar: 2.5 })
        confetti({ ...defaults, particleCount: count * 0.2, spread: 180, angle: 90,
          colors: ['#ffffff', '#ffff00'], startVelocity: 80, scalar: 1.2 })
      } catch { /* ignore */ }
    }, 500)
  },
}

// ─── Classes CSS d'animation par slug ───
// Appliquée sur l'image elle-même via className dynamique côté LiveRace.
// Toutes sont définies en transform-only dans LiveRace.css (pas de left/top
// pour compatibilité avec le flexbox centré du parent).
export const SLUG_ANIM_CLASS = {
  emote_poop:      'pemote-anim-poop',
  emote_fart:      'pemote-anim-fart',
  sound_horn:      'pemote-anim-horn',
  emote_clown:     'pemote-anim-clown',
  emote_fire:      'pemote-anim-fire',
  emote_wheelie:   'pemote-anim-wheelie',
  emote_crash:     'pemote-anim-crash',
  emote_trophy:    'pemote-anim-trophy',
  sound_airhorn:   'pemote-anim-airhorn',
  emote_rooster:   'pemote-anim-rooster',
  emote_laughcry:  'pemote-anim-laughcry',
  emote_mindblown: 'pemote-anim-mindblown',
}

// ─── Overrides photo+son hardcodés ───
// Ces emotes utilisent les assets HTML d'origine, peu importe ce qui est
// uploadé dans Supabase pour cet item.
//
// - sound_horn : photo ET son forcés (les deux assets locaux existent)
// - emote_wheelie / emote_crash / emote_trophy / emote_clown : seule la
//   photo est forcée. Pas de MP3 dispo dans Design/Emotes/Assets/ pour
//   ces slugs → on garde le sound_url de Supabase (paramétrable via
//   EmoteAdmin). Tu pourras y uploader un son quand tu veux.
export const MEDIA_OVERRIDES = {
  sound_horn: {
    mediaSrc: '/emotes/premium_horn.png',
    soundSrc: '/emotes/premium_horn.mp3',
    mediaType: 'image',
  },
  emote_wheelie: {
    mediaSrc: '/emotes/premium_wheelie.png',
    mediaType: 'image',
  },
  emote_crash: {
    mediaSrc: '/emotes/premium_crash.png',
    mediaType: 'image',
  },
  emote_trophy: {
    mediaSrc: '/emotes/premium_trophy.png',
    mediaType: 'image',
  },
  emote_clown: {
    mediaSrc: '/emotes/premium_clown.png',
    mediaType: 'image',
  },
}

// ─── Point d'entrée ───
export const playPremiumEffects = (slug) => {
  const fn = EFFECTS[slug]
  if (fn) {
    try { fn() } catch (e) { console.warn('[premium-effect]', slug, e) }
  }
}
