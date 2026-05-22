import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import AgoraRTC from 'agora-rtc-sdk-ng'
import LiveTeamDrawer from './LiveTeamDrawer'
// Lazy-load du composant Stripe : il charge le SDK stripe.js (~50 KB) via
// loadStripe() au niveau module. Avec lazy, ce coût est payé seulement quand
// le user ouvre vraiment la boutique. Pour le viewer qui regarde juste le
// live sans rien acheter = 0 KB de Stripe.
const StripePurchaseButton = lazy(() => import('./StripePurchaseButton'))
import RaceFlagOverlay from './RaceFlagOverlay'
import { playPremiumSound, playDonationSound, playRaceSignalSound, playAnnouncementSound } from '../utils/soundEffects'
import { playPremiumEffects, playDonationSparks, SLUG_ANIM_CLASS, MEDIA_OVERRIDES } from '../utils/premiumEmoteEffects'
import { speakDonation, warmUpTTS, isDonationTTSEnabled, setDonationTTSEnabled, speakAnnouncement } from '../utils/donationTTS'
import { useToast } from './Toast'
import './LiveRace.css'

const EMOJIS = ['🔥', '👏', '🏁', '🏍️', '⚡', '🤙', '😱', '🚀']

// Module-level helpers (purs vis-à-vis du render React : la règle
// react-hooks "no-impure-during-render" n'analyse pas le body des fonctions
// module-level, donc OK d'appeler Date.now()/Math.random() depuis ici).
// Sémantique : ces helpers sont utilisés uniquement depuis des event
// handlers / callbacks realtime, jamais pendant le render.
const newAlertId = () => `${Date.now()}-${Math.random()}`
const nowMs      = () => Date.now()

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

const formatElapsed = (ms) => {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
}

export default function LiveRace({ customSessionId, onClose, onAutoExit }) {
  const toast = useToast()
  const [session, setSession]               = useState(null)
  const [teams, setTeams]                   = useState([])
  const [laps, setLaps]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [highlightedLap, setHighlightedLap] = useState(null)
  const [eventInfo, setEventInfo]           = useState(null)
  const [elapsed, setElapsed]               = useState(0)


  // ── New features ──
  const [spectatorCount, setSpectatorCount] = useState(1)
  // Santé du canal Realtime : drive le fallback de polling (uniquement
  // actif quand le socket est en erreur, sinon coût nul).
  const [channelHealthy, setChannelHealthy] = useState(true)
  // Génération du channel realtime : incrémenté à chaque CLOSED/TIMED_OUT
  // pour forcer la recréation complète du channel via les deps du useEffect.
  // Sans ça, supabase-js peut laisser le channel en CLOSED définitif (le
  // socket sous-jacent se reconnecte mais ne re-join pas toujours le channel).
  const [channelGen, setChannelGen] = useState(0)
  const [floatingEmojis, setFloatingEmojis] = useState([])
  const [announcement, setAnnouncement]     = useState(null)
  const [positionDeltas, setPositionDeltas] = useState({}) // teamId → signed int
  const [expandedRider, setExpandedRider]   = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null) // drawer latéral
  const [copied, setCopied]                 = useState(false)
  const [teamStatuses, setTeamStatuses]     = useState({}) // teamId → 'DNF' | 'DNS'
  
  // ── Anti-Spam (Cooldowns) ──
  // Lazy initializer : exécuté UNE fois au mount. Restore le penalty/cooldown
  // du user et décay la pénalité d'1 niveau si le cooldown est expiré (pardon
  // progressif). Évite le setState-in-effect au mount + le useEffect inutile.
  const [[spamPenaltyLevel, cooldownUntil], setSpamState] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('myd_emote_spam_data') || 'null')
      if (!stored) return [0, 0]
      if (stored.cooldownUntil > Date.now()) {
        return [stored.penaltyLevel || 0, stored.cooldownUntil || 0]
      }
      // Cooldown expiré : decay -1
      const decayed = Math.max(0, (stored.penaltyLevel || 1) - 1)
      try {
        localStorage.setItem('myd_emote_spam_data', JSON.stringify({ penaltyLevel: decayed, cooldownUntil: 0 }))
      } catch { /* quota / privé */ }
      return [decayed, 0]
    } catch { return [0, 0] }
  })
  const recentEmotesRef = useRef([])

  const saveSpamData = (level, until) => {
    setSpamState([level, until])
    try {
      localStorage.setItem('myd_emote_spam_data', JSON.stringify({
        penaltyLevel: level,
        cooldownUntil: until
      }))
    } catch { /* quota / privé */ }
  }

  // ── Tabs State ──
  const [activeViewTab, setActiveViewTab]   = useState('classement') // 'classement' | 'podiums' | 'activite'
  const [announcementsHistory, setAnnouncementsHistory] = useState([])

  // ── Premium features ──
  const [authUser, setAuthUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [shopItems, setShopItems] = useState([])
  const [userPurchases, setUserPurchases] = useState([])
  const [activeAlerts, setActiveAlerts] = useState([])
  const [shopOpen, setShopOpen] = useState(false)
  // Filtre catégorie de la boutique : 'all' | 'emote' | 'sponsoring'
  const [shopCategoryFilter, setShopCategoryFilter] = useState('all')
  const [fabOpen, setFabOpen] = useState(false) // floating action button
  const fabLastToggleRef = useRef(0) // debounce hard contre double-fire mobile

  // Note pivot Stripe (v26) : tout le state du formulaire de "don à montant
  // libre" (donationPseudo, donationMessage, donationAmount, customAmount,
  // pseudoCheckState) a été supprimé. Chaque produit shop_items a maintenant
  // son propre prix fixe ; le pseudo + message custom (services live) sont
  // gérés dans StripePurchaseButton.jsx, qui re-vérifie l'unicité du pseudo
  // côté serveur via l'Edge Function avant de créer le PaymentIntent.

  // ── TTS warm-up : précharge les voix navigateur au mount (Chrome charge
  //    les voix de façon async, donc la 1re lecture peut tomber sur une
  //    liste vide si on ne pré-trigger pas. warmUpTTS() force le chargement.
  useEffect(() => {
    warmUpTTS()
  }, [])

  // ── Audio unlock for mobile browsers ──
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return
    // Play a tiny silent sound to unlock the audio context on mobile
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    } catch { /* ignore */ }
    setAudioUnlocked(true)
  }, [audioUnlocked])

  useEffect(() => {
    document.addEventListener('click', unlockAudio, { once: true })
    document.addEventListener('touchstart', unlockAudio, { once: true })
    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
    }
  }, [unlockAudio])

  const elapsedRef          = useRef(null)
  const prevRankingsRef     = useRef({})
  const extrasChannelRef    = useRef(null)
  // IDs des dons déjà notifiés en alerte (live realtime OU polling fallback).
  // Permet d'appeler triggerDonationAlert sans risque de double déclenchement
  // quand le polling rattrape un don déjà reçu via le channel realtime.
  const seenDonationIdsRef  = useRef(new Set())

  // ── Stream vidéo broadcaster (orga) → viewer ──
  // Agora gère l'injection de la vidéo directement dans la div
  const streamDivRef = useRef(null)
  const agoraClientRef = useRef(null)
  const remoteAudioTrackRef = useRef(null)
  const videoWrapperRef = useRef(null)
  
  const [broadcasterUid, setBroadcasterUid] = useState(null)
  const [isAudioMuted, setIsAudioMuted] = useState(true)
  const [videoQuality, setVideoQuality] = useState('auto') // 'auto', 'high', 'low'
  
  // Booléen state pour afficher le panneau vidéo dès qu'une frame arrive
  // (avant ça, on affiche un placeholder "En attente du signal"). On dépend
  // aussi de session.live_stream_active pour montrer/cacher l'encadré.
  const [streamReceiving, setStreamReceiving] = useState(false)

  // Gestion du volume quand le state change
  useEffect(() => {
    if (remoteAudioTrackRef.current) {
      remoteAudioTrackRef.current.setVolume(isAudioMuted ? 0 : 100)
    }
  }, [isAudioMuted])

  // Gestion de la qualité et du dual stream
  useEffect(() => {
    if (!agoraClientRef.current || !broadcasterUid) return
    const client = agoraClientRef.current
    try {
      if (videoQuality === 'auto') {
        client.setRemoteVideoStreamType(broadcasterUid, 0) // 0 = High
        client.setStreamFallbackOption(broadcasterUid, 2) // 2 = Audio/Low
      } else if (videoQuality === 'high') {
        client.setStreamFallbackOption(broadcasterUid, 0) // 0 = Disable fallback
        client.setRemoteVideoStreamType(broadcasterUid, 0)
      } else if (videoQuality === 'low') {
        client.setStreamFallbackOption(broadcasterUid, 0)
        client.setRemoteVideoStreamType(broadcasterUid, 1) // 1 = Low
      }
    } catch (e) {
      console.warn("Could not set dual stream options:", e)
    }
  }, [videoQuality, broadcasterUid])

  const toggleFullscreen = () => {
    if (!videoWrapperRef.current) return;
    if (!document.fullscreenElement) {
      videoWrapperRef.current.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  // Flag "j'ai vu cette session en status='live' pendant que je la
  // regardais" → utilisé pour décider si l'overlay drapeau post-race
  // doit apparaître (= uniquement pour ceux qui ont vécu la transition
  // live → finished en temps réel, pas pour les visiteurs d'archives).
  // En state (et non en ref) pour respecter les règles React :
  // lire/écrire un ref pendant le render est un footgun (peut casser
  // en concurrent rendering).
  const [sawLive, setSawLive] = useState(false)

  // ── Premium Shop & Alert Refs ──
  const shopItemsRef = useRef([])
  useEffect(() => {
    shopItemsRef.current = shopItems
  }, [shopItems])

  // ── Queue séquentielle d'alertes ──
  // On affiche au plus UNE alerte par type à la fois (donation +
  // premium-reaction peuvent coexister, sur des zones différentes
  // de l'écran). Le son ne se déclenche qu'au moment où l'alerte
  // devient visible (= tête de sa queue). Les suivantes attendent.
  const activatedAlertsRef = useRef(new Set())
  useEffect(() => {
    const heads = {
      donation: activeAlerts.find(a => a.type === 'donation'),
      'premium-reaction': activeAlerts.find(a => a.type === 'premium-reaction'),
    }
    const timers = []
    for (const [, head] of Object.entries(heads)) {
      if (!head || activatedAlertsRef.current.has(head.id)) continue
      activatedAlertsRef.current.add(head.id)

      // ── Son ──
      if (head.type === 'donation') {
        playDonationSound()
        // Confetti néon : petites étincelles (≤10€) ou explosion massive
        // multi-bursts (>10€ = MEGA SPONSOR), cf. playDonationSparks.
        playDonationSparks(head.amount || 0)
        // TTS façon Twitch : "Pseudo a offert une bière, et dit : message"
        // Joue ~800ms après le son de notification pour ne pas se chevaucher.
        // On enrichit le payload avec le nom du produit si dispo, pour que
        // le TTS lise "a offert une bière" au lieu du générique.
        const itemForTTS = head.item_slug
          ? shopItemsRef.current.find(s => s.slug === head.item_slug)
          : null
        setTimeout(() => speakDonation({
          ...head,
          item_name: itemForTTS?.name || null,
        }), 800)
      } else if (head.type === 'premium-reaction') {
        const item = head.item
        const override = MEDIA_OVERRIDES[item.slug]
        // Priorité : ce que l'admin a uploadé dans Supabase via EmoteAdmin
        // GAGNE sur le hardcoded override (qui ne sert plus que de fallback
        // pour les emotes sans upload custom). Avant : l'override forçait
        // toujours le PNG local → un MP4 uploadé ne se jouait jamais.
        const hasSupabaseMedia = !!(item.media_url || item.animation_url)
        const hasSupabaseSound = !!item.sound_url
        const soundUrl = hasSupabaseSound ? item.sound_url : (override?.soundSrc || null)
        const isVideo = hasSupabaseMedia
          ? (item.media_type === 'mp4' ||
             /\.(mp4|webm)($|\?)/i.test(item.media_url || item.animation_url || ''))
          : (override?.mediaType === 'mp4')

        if (soundUrl) {
          try {
            const audio = new Audio(soundUrl)
            audio.volume = 0.15  // baissé : pour équilibrer avec les annonces
            audio.play().catch(() => { if (!isVideo) playPremiumSound(item.slug) })
          } catch {
            if (!isVideo) playPremiumSound(item.slug)
          }
        } else if (!isVideo) {
          playPremiumSound(item.slug)
        }

        // Effets visuels (confetti + screen shake) par-slug.
        // Fire-and-forget, ne bloque pas le rendu de l'image.
        playPremiumEffects(item.slug)
      }

      // ── Programmer le retrait ──
      // - donation        : 8s (le temps de lire le message)
      // - premium video   : 30s (safety net ; le retrait normal vient du
      //                          <video onEnded> qui dismisse à la durée
      //                          RÉELLE du clip). Avant : 10s coupait les
      //                          vidéos custom plus longues que ça.
      // - premium non-vid : 7s (GIF/image animée + son synth ~1-2s)
      let duration
      if (head.type === 'donation') {
        duration = 8000
      } else if (head.type === 'premium-reaction') {
        const item = head.item
        const isVideo = item.media_type === 'mp4' || /\.(mp4|webm)($|\?)/i.test(item.media_url || item.animation_url || '')
        duration = isVideo ? 30000 : 7000
      } else {
        duration = 7000
      }
      const tid = setTimeout(() => {
        activatedAlertsRef.current.delete(head.id)
        setActiveAlerts(prev => prev.filter(a => a.id !== head.id))
      }, duration)
      timers.push(tid)
    }
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [activeAlerts])

  // Permet à un <video onEnded> de retirer son alerte avant le cap
  // (animation joue jusqu'à sa fin réelle puis dégage la queue).
  const dismissAlertImmediately = (alertId) => {
    activatedAlertsRef.current.delete(alertId)
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId))
  }

  // ── Premium Auth & Shop Setup ──
  const fetchUserProfile = async (uid) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (data) setUserProfile(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchUserPurchases = async (uid) => {
    if (!uid) return
    try {
      const { data } = await supabase.from('user_purchases').select('item_slug').eq('user_id', uid)
      if (data) {
        setUserPurchases(data.map(p => p.item_slug))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchShopItems = async () => {
    try {
      const { data } = await supabase.from('shop_items').select('*').eq('is_visible', true).order('sort_order', { ascending: true })
      if (data) setShopItems(data)
    } catch (err) {
      console.error(err)
    }
  }

  // ── Enqueueing (NE déclenche PAS le son ; c'est l'effet ci-dessous qui
  //    le fait quand l'alerte devient la "tête" de sa queue) ──
  const triggerPremiumReaction = (slug, userDisplayName) => {
    const item = shopItemsRef.current.find(i => i.slug === slug)
    if (!item) return
    setActiveAlerts(prev => [...prev, {
      id: newAlertId(),
      type: 'premium-reaction',
      item,
      userDisplayName,
    }].slice(-30)) // cap dur pour éviter un buildup infini
  }

  const triggerDonationAlert = (row) => {
    if (!row?.id) return
    // Dedup : le polling fallback peut rattraper un message déjà notifié via
    // le channel realtime. On garde la trace des IDs déjà alertés.
    if (seenDonationIdsRef.current.has(row.id)) return
    seenDonationIdsRef.current.add(row.id)
    setActiveAlerts(prev => [...prev, {
      id: newAlertId(),
      type: 'donation',
      display_name: row.display_name,
      amount: row.amount_cents / 100,
      message: row.message,
      // item_slug pour retrouver le nom du produit (Offrir une bière, etc.)
      // côté render et TTS. Null pour les anciens dons legacy.
      item_slug: row.item_slug || null,
    }].slice(-30))
  }

  const sendPremiumReaction = (item) => {
    if (nowMs() < cooldownUntil) {
      const remainingSecs = Math.ceil((cooldownUntil - nowMs()) / 1000)
      let timeStr = `${remainingSecs} secondes`
      if (remainingSecs > 60) {
        timeStr = `${Math.ceil(remainingSecs / 60)} minutes`
      }
      toast.warning(`Afin de ne pas spammer le live, vous êtes bloqué pour encore ${timeStr}.`)
      return
    }

    const now = nowMs()
    const windowStart = now - 15000 // 15 seconds window
    recentEmotesRef.current = recentEmotesRef.current.filter(t => t > windowStart)
    recentEmotesRef.current.push(now)

    if (recentEmotesRef.current.length > 4) {
      // Penalty applies on the 5th emote within 15 seconds
      const newLevel = Math.min(spamPenaltyLevel + 1, 5)
      let penaltyMinutes = 1
      if (newLevel === 2) penaltyMinutes = 2
      if (newLevel === 3) penaltyMinutes = 5
      if (newLevel === 4) penaltyMinutes = 10
      if (newLevel >= 5) penaltyMinutes = 15

      const until = now + penaltyMinutes * 60000
      saveSpamData(newLevel, until)
      recentEmotesRef.current = [] // reset

      toast.error(`Vous avez envoyé trop d'animations. Vous êtes bloqué pour ${penaltyMinutes} minute(s).`)
      return
    }

    const nameToUse = userProfile?.display_name || authUser?.email?.split('@')[0] || 'Un Rider'
    // 1. Trigger locally
    triggerPremiumReaction(item.slug, nameToUse)
    // 2. Broadcast (instantané pour les viewers connectés)
    extrasChannelRef.current?.send({
      type: 'broadcast',
      event: 'premium-reaction',
      payload: { slug: item.slug, userDisplayName: nameToUse }
    })
    // 3. Log permanent en DB (historique + replay possible) — fire-and-forget
    supabase.from('emote_triggers').insert([{
      user_id: authUser?.id || null,
      display_name: nameToUse,
      item_slug: item.slug,
      session_id: session?.id || null,
    }]).then(({ error }) => {
      if (error) console.warn('[emote_triggers] insert failed:', error.message)
    })
  }


  // Note lint : setState dans cet effect = fetch initial async (shopItems,
  // userProfile, userPurchases) + abonnement onAuthStateChange. Pattern
  // standard de "synchronisation avec un système externe" (Supabase auth).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchShopItems()

    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      if (authSession) {
        setAuthUser(authSession.user)
        fetchUserProfile(authSession.user.id)
        fetchUserPurchases(authSession.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (authSession) {
        setAuthUser(authSession.user)
        fetchUserProfile(authSession.user.id)
        fetchUserPurchases(authSession.user.id)
      } else {
        setAuthUser(null)
        setUserProfile(null)
        setUserPurchases([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Helpers ──
  const addFloatingEmoji = (emoji) => {
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now() + Math.random()
    // eslint-disable-next-line react-hooks/purity
    const x = 5 + Math.random() * 88
    setFloatingEmojis(prev => [...prev, { id, emoji, x }])
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 3200)
  }

  const sendReaction = (emoji) => {
    addFloatingEmoji(emoji)
    extrasChannelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
  }

  // ── Realtime laps & session ──
  // Helper : refetch complet des laps. Sert pour les DELETE (undo chrono)
  // et les UPDATE — qu'on ne peut pas patcher proprement en mémoire.
  const refetchLaps = useCallback(async (sid) => {
    if (!sid) return
    const { data } = await supabase
      .from('race_laps')
      .select('*')
      .eq('session_id', sid)
      .order('recorded_at', { ascending: false })
    if (data) setLaps(data)
  }, [])

  useEffect(() => {
    if (!session?.id) return
    const ch = supabase.channel(`live_race_public_${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_laps', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setLaps(prev => prev.some(l => l.id === row.id) ? prev : [row, ...prev])
        setHighlightedLap(row.id)
        setTimeout(() => setHighlightedLap(null), 4000)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'race_laps', filter: `session_id=eq.${session.id}` }, ({ old: row }) => {
        // Patch en place — pas de refetch complet
        if (row?.id) setLaps(prev => prev.filter(l => l.id !== row.id))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_laps', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        if (row?.id) setLaps(prev => prev.map(l => l.id === row.id ? row : l))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_teams', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        if (row?.id) setTeams(prev => prev.map(t => t.id === row.id ? row : t))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${session.id}` }, ({ new: row }) => {
        setSession(prev => {
          // Détecter les transitions pour jouer le son de signal de course
          if (prev && row) {
            const wasStarted   = !!prev.started_at
            const isStarted    = !!row.started_at
            const wasLive      = prev.status === 'live'
            const isFinished   = row.status === 'finished' || row.status === 'published'
            // Départ de course : started_at passe de null → date
            if (!wasStarted && isStarted) {
              playRaceSignalSound()
            }
            // Fin de course : status live → finished/published
            else if (wasLive && isFinished) {
              playRaceSignalSound()
            }
          }
          return row
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_announcements', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setAnnouncementsHistory(prev => [row, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_messages', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        triggerDonationAlert(row)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannelHealthy(true)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[LiveRace] Realtime channel status:', status, '→ recréation du channel + fallback polling')
          setChannelHealthy(false)
          // Resync immédiat pour rattraper ce qu'on a raté pendant le down
          refetchLaps(session.id)
          supabase.from('race_sessions').select('*').eq('id', session.id).maybeSingle()
            .then(({ data }) => { if (data) setSession(data) })
          // Force la recréation complète du channel après un court backoff.
          // Sans ça, supabase-js peut rester en CLOSED indéfiniment (le
          // socket se reconnecte mais ne re-join pas toujours le channel).
          // Le backoff de 2s évite un thundering retry sur un réseau down.
          setTimeout(() => setChannelGen(g => g + 1), 2000)
        }
      })
    return () => supabase.removeChannel(ch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, channelGen])

  // ── Presence — spectator count ──
  useEffect(() => {
    if (!session?.id) return
    const ch = supabase.channel(`presence-live-${session.id}`, {
      config: { presence: { key: Math.random().toString(36).substring(2, 10) } }
    })
    ch.on('presence', { event: 'sync' }, () => {
      setSpectatorCount(Object.keys(ch.presenceState()).length)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ joined_at: Date.now() })
    })
    return () => supabase.removeChannel(ch)
  }, [session?.id])

  // ── Broadcast — emoji reactions + announcements orga ──
  useEffect(() => {
    if (!session?.id) return
    const ch = supabase.channel(`live-extras-${session.id}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        addFloatingEmoji(payload.emoji)
      })
      .on('broadcast', { event: 'announcement' }, ({ payload }) => {
        setAnnouncement(payload.text)
        
        // Mise à jour immédiate de l'historique sans attendre la BDD
        const newAnn = {
          id: 'temp-' + Date.now(),
          message: payload.text,
          created_at: new Date().toISOString()
        }
        setAnnouncementsHistory(prev => {
          if (prev.some(a => a.message === payload.text && (Date.now() - new Date(a.created_at).getTime() < 10000))) return prev
          return [newAnn, ...prev]
        })

        playAnnouncementSound()
        // Délai de 1.5s pour laisser la petite mélodie "ding-dong" se finir
        setTimeout(() => speakAnnouncement(payload.text), 1500)
        setTimeout(() => setAnnouncement(null), 12000)
      })
      .on('broadcast', { event: 'team-status' }, ({ payload }) => {
        setTeamStatuses(prev => ({ ...prev, [payload.teamId]: payload.status }))
      })
      .on('broadcast', { event: 'premium-reaction' }, ({ payload }) => {
        triggerPremiumReaction(payload.slug, payload.userDisplayName)
      })
      // Simulation d'achat admin : émise par l'edge function `stripe-donation`
      // (action='admin-simulate-purchase') via la HTTP Realtime API en
      // service_role. Le seul chemin d'émission passe par cette function
      // qui exige role='admin' côté serveur → pas de spoof possible par
      // les viewers. AUCUN insert en BDD : c'est purement de l'animation.
      .on('broadcast', { event: 'purchase-simu' }, ({ payload }) => {
        triggerDonationAlert(payload)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Recréation après backoff — sinon les broadcasts (réactions emojis,
          // annonces orga, donation-simu) tombent au moindre déco socket.
          setTimeout(() => setChannelGen(g => g + 1), 2000)
        }
      })
    extrasChannelRef.current = ch
    return () => supabase.removeChannel(ch)
  }, [session?.id, channelGen])

  // ── Elapsed timer ──
  // Deps spécifiques (avant : `[session]`, donc relancé à chaque remplacement
  // de l'objet session par le polling ou realtime, ce qui figeait le timer
  // une fraction de seconde à chaque tick).
  // Note lint : setState dans cet effect = synchronisation avec une horloge
  // externe (Date.now via setInterval). Pattern parfaitement légitime.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    clearInterval(elapsedRef.current)
    if (session?.started_at && session?.status === 'live') {
      const startMs = new Date(session.started_at).getTime()
      setElapsed(Date.now() - startMs)
      elapsedRef.current = setInterval(() => {
        setElapsed(Date.now() - startMs)
      }, 1000)
    } else {
      setElapsed(0)
    }
    return () => clearInterval(elapsedRef.current)
  }, [session?.started_at, session?.status])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Stream vidéo : subscribe au channel Agora quand un live est actif ──
  useEffect(() => {
    if (!session?.id || !session?.live_stream_active) {
      setStreamReceiving(false)
      return
    }
    setStreamReceiving(false)
    let isMounted = true

    const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "audience" })
    agoraClientRef.current = client

    // Helper unique pour subscribe + play. Appelé soit depuis l'event
    // `user-published` (broadcaster qui démarre APRÈS notre join), soit
    // depuis la boucle post-join pour rattraper le broadcaster qui était
    // DÉJÀ là (sinon l'event ne se redéclenche pas et on reste figé).
    const handleUserMedia = async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType)
      } catch (subErr) {
        console.error('[stream-viewer] subscribe failed:', subErr)
        return
      }
      if (!isMounted) return
      setBroadcasterUid(user.uid)

      if (mediaType === "video") {
        setStreamReceiving(true)
        // Petit délai pour laisser React render le div (display:block après
        // setStreamReceiving). Sans ça, play() peut tomber sur display:none
        // et la vidéo ne s'affiche pas même si elle joue.
        setTimeout(() => {
          if (isMounted && streamDivRef.current && user.videoTrack) {
            user.videoTrack.play(streamDivRef.current, { fit: "contain" })
          }
        }, 50)
      }
      if (mediaType === "audio") {
        remoteAudioTrackRef.current = user.audioTrack
        user.audioTrack.play()
        user.audioTrack.setVolume(isAudioMuted ? 0 : 100)
      }
    }

    client.on("user-published", handleUserMedia)

    client.on("user-unpublished", (user, mediaType) => {
      if (!isMounted) return
      if (mediaType === "video") setStreamReceiving(false)
    })

    const joinAgora = async () => {
      try {
        const appId = import.meta.env.VITE_AGORA_APP_ID;
        if (!appId) return;
        const channelName = `live-stream-${session.id}`

        // Identifiant viewer : auth.uid pour les users connectés, sinon
        // un UUID aléatoire stable pour la session (anonyme).
        const { data: { user: authUser } } = await supabase.auth.getUser()
        const viewerUid = authUser?.id || `viewer-${crypto.randomUUID()}`

        // Récupère un token Agora (audience) — nécessaire en Secured Mode.
        // Fallback silencieux sur null si l'Edge Function n'est pas dispo
        // (cas Testing Mode : le join sans token marche encore).
        let agoraToken = null
        try {
          const { data: tokenData } = await supabase.functions.invoke('agora-token', {
            body: { channelName, uid: viewerUid, role: 'audience' },
          })
          if (tokenData?.token) agoraToken = tokenData.token
        } catch (tokenErr) {
          console.warn('[stream-viewer] agora-token KO, fallback no-token:', tokenErr?.message || tokenErr)
        }

        await client.join(appId, channelName, agoraToken, viewerUid)

        // Rattrapage : si le broadcaster publiait DÉJÀ avant notre join,
        // l'event "user-published" ne se redéclenche pas — il faut subscribe
        // manuellement à ce qui est déjà dans la room.
        for (const remoteUser of client.remoteUsers) {
          if (remoteUser.hasVideo) await handleUserMedia(remoteUser, 'video')
          if (remoteUser.hasAudio) await handleUserMedia(remoteUser, 'audio')
        }
      } catch (err) {
        console.error("Agora join error", err)
      }
    }
    joinAgora()

    return () => {
      isMounted = false
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(console.error)
        agoraClientRef.current = null
      }
    }
  }, [session?.id, session?.live_stream_active])

  // ── Initial load ──
  const loadLiveSession = async () => {
    setLoading(true)
    let sessions;
    if (customSessionId) {
      const { data } = await supabase.from('race_sessions').select('*').eq('id', customSessionId).limit(1)
      sessions = data || []
    } else {
      const { data } = await supabase.from('race_sessions').select('*')
        .in('status', ['live', 'finished', 'published'])
        .order('created_at', { ascending: false }).limit(1)
      sessions = data || []
    }
    if (sessions.length > 0) {
      const s = sessions[0]
      // ⚠️ ORDRE CRITIQUE : on pré-remplit seenDonationIdsRef AVANT setSession.
      // Sinon le polling useEffect (qui dep sur session?.id) fire son premier
      // tick avant que le ref soit rempli → tous les messages existants
      // re-déclenchent l'alerte à chaque navigation vers le live.
      const { data: existingMessages } = await supabase
        .from('live_messages').select('id').eq('session_id', s.id)
      seenDonationIdsRef.current = new Set((existingMessages || []).map(d => d.id))

      setSession(s)
      const { data: ev } = await supabase.from('events').select('*').eq('id', s.event_id).single()
      setEventInfo(ev)
      const { data: teamsData } = await supabase.from('race_teams').select('*').eq('session_id', s.id).order('moto_number')
      setTeams(teamsData || [])
      const { data: lapsData } = await supabase.from('race_laps').select('*').eq('session_id', s.id).order('recorded_at', { ascending: false })
      setLaps(lapsData || [])
      const { data: annData } = await supabase.from('race_announcements').select('*').eq('session_id', s.id).order('created_at', { ascending: false })
      setAnnouncementsHistory(annData || [])
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadLiveSession() }, [customSessionId])

  // Reset le flag "vu en live" quand on change de session : sinon naviguer
  // depuis une course live vers une course archivée déclencherait à tort
  // l'overlay post-race sur l'archive.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSawLive(false)
  }, [customSessionId])

  // Bascule sawLive=true dès qu'on observe la session en status='live'.
  // Avant : on faisait `sawLiveRef.current = true` directement en render,
  // ce qui violait les règles React (lecture/écriture de ref en render
  // = footgun concurrent rendering).
  // Note lint : la règle "set-state-in-effect" recommande de dériver l'état
  // au lieu de le synchroniser. Ici on a un VRAI accumulateur (sticky bit)
  // qu'on ne peut PAS dériver de session.status seul (il faut la mémoire
  // de la transition). C'est exactement l'usage légitime de useEffect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session?.status === 'live') setSawLive(true)
  }, [session?.status])

  // ── Wake Lock + Resync au retour de l'arrière-plan (handler unifié) ──
  // Avant : 2 handlers concurrents qui doublonnaient les refetch au focus.
  // Maintenant : 1 seul, qui réacquiert le wake lock (libéré quand l'onglet
  // est caché) et resync uniquement si on est resté >2s en background.
  useEffect(() => {
    if (!session?.id) return
    const sid = session.id
    let wakeLock = null
    let lastVisibleAt = Date.now()

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch { /* permission refusée / API indispo : non-bloquant */ }
    }

    const onVisible = async () => {
      if (document.visibilityState !== 'visible') {
        lastVisibleAt = Date.now()
        return
      }
      // Wake lock auto-libéré par le navigateur quand l'onglet est caché
      await requestWakeLock()
      // Resync uniquement si on est resté >2s en arrière-plan (le socket
      // Supabase peut avoir raté des events pendant la suspension).
      if (Date.now() - lastVisibleAt > 2000) {
       // Refresh teams
      supabase.from('race_teams').select('*').eq('session_id', sid).order('moto_number')
        .then(({ data }) => {
          if (data) {
            setTeams(prev => {
              if (JSON.stringify(prev) === JSON.stringify(data)) return prev
              return data
            })
          }
        })
      // Refresh session
      supabase.from('race_sessions').select('*').eq('id', sid).maybeSingle()
          .then(({ data }) => { if (data) setSession(data) })
      }
      lastVisibleAt = Date.now()
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (wakeLock !== null) wakeLock.release().catch(() => {})
    }
  }, [session?.id, refetchLaps])

  // ── Fallback de polling ──
  // Tourne en permanence pour garantir la mise à jour des données même quand
  // le channel realtime Supabase est down (Wi-Fi flottant, JWT renouvelé, etc.).
  // Tick à 3s — assez court pour que la "page d'attente" (pre-race overlay)
  // se ferme rapidement quand le chrono démarre, et que les classements +
  // donations live restent à jour si le WebSocket meurt.
  useEffect(() => {
    if (!session?.id) return
    const sid = session.id
    console.warn('[LiveRace] Fallback polling actif (3s)')

    const tick = () => {
      // 1. Session : remplace si N'IMPORTE QUEL champ a changé
      supabase.from('race_sessions').select('*').eq('id', sid).maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setSession(prev => {
            if (!prev) return data
            // Deep compare via JSON (taille négligeable : 1 row)
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev
            return data
          })
        })

      // 2. Teams : remplace si N'IMPORTE QUEL changement détecté (avant : seulement
      //    moto_number/pilot_1_name/category, on ratait pilot_2_name, etc.)
      supabase.from('race_teams').select('*').eq('session_id', sid).order('moto_number')
        .then(({ data }) => {
          if (!data) return
          setTeams(prev => {
            if (prev.length !== data.length) return data
            const prevById = new Map(prev.map(t => [t.id, t]))
            for (const t of data) {
              const old = prevById.get(t.id)
              if (!old || JSON.stringify(old) !== JSON.stringify(t)) return data
            }
            return prev
          })
        })

      // 3. Laps : remplace si une ligne a changé (INSERT/UPDATE/DELETE), avant
      //    on ratait les UPDATE car comparaison par set d'IDs uniquement.
      supabase.from('race_laps').select('*').eq('session_id', sid)
        .order('recorded_at', { ascending: false })
        .then(({ data }) => {
          if (!data) return
          setLaps(prev => {
            if (prev.length !== data.length) return data
            const prevById = new Map(prev.map(l => [l.id, l]))
            for (const l of data) {
              const old = prevById.get(l.id)
              if (!old || old.lap_time_ms !== l.lap_time_ms || old.lap_number !== l.lap_number
                  || old.moto_number !== l.moto_number || old.team_id !== l.team_id) return data
            }
            return prev
          })
        })

      // 4. live_messages : déclenche l'alerte live pour tout NOUVEL ID non vu.
      //    Le triggerDonationAlert dédup déjà via seenDonationIdsRef, donc
      //    sans danger de re-trigger sur ceux déjà reçus via realtime.
      //    Crucial pour que les achats s'affichent même quand le WebSocket
      //    Supabase est down (cf. issue : "alertes ne s'affichent plus en live").
      supabase.from('live_messages').select('*').eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (!data) return
          // On parcourt du plus ancien au plus récent pour que la file
          // d'alertes garde un ordre chronologique cohérent.
          for (let i = data.length - 1; i >= 0; i--) {
            triggerDonationAlert(data[i])
          }
        })
    }
    tick()
    const interval = setInterval(tick, 3000)
    return () => clearInterval(interval)
  }, [session?.id, channelHealthy])

  // ── Track position changes when laps update ──
  // ── Classement memoizé pour TOUTES les catégories d'un coup ──
  // Avant : getRankings(cat) était appelé 1× pour la vue principale +
  // 1× par catégorie en onglet Podiums + 1× par le tracker de deltas,
  // soit 6-8 recalculs O(teams × laps) PAR render. Avec ce memo, on
  // calcule UNE fois par changement de laps/teams.
  const rankingsCache = useMemo(() => {
    const cats = ['all', ...(session?.categories || [])]
    const cache = {}
    for (const cat of cats) {
      const catTeams = cat === 'all' ? teams : teams.filter(t => t.category === cat)
      const sorted = catTeams.map(team => {
        const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
        const actualLapsCount = teamLaps.length
        const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
        let bestLap = null, lastLap = null, avgLap = null
        if (actualLapsCount > 0) {
          // Calcul des durées en une passe (reduce manuel, stack-safe)
          let bl = teamLaps[0].lap_time_ms
          let lastDur = teamLaps[0].lap_time_ms
          for (let i = 1; i < actualLapsCount; i++) {
            const dur = teamLaps[i].lap_time_ms - teamLaps[i - 1].lap_time_ms
            if (dur < bl) bl = dur
            lastDur = dur
          }
          bestLap = bl
          lastLap = lastDur
          avgLap = Math.round(teamLaps[actualLapsCount - 1].lap_time_ms / actualLapsCount)
        }
        return {
          ...team, bestLap, avgLap, lastLap, totalLaps, laps: teamLaps,
          lastPassageTime: actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
        }
      }).filter(t => t.totalLaps > 0)
        .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)

      cache[cat] = sorted.map((r, index) => {
        if (index === 0) return { ...r, gapToLeader: 'LEADER', interval: '-' }
        const leader = sorted[0]; const prev = sorted[index - 1]
        const gapToLeader = r.totalLaps === leader.totalLaps
          ? `+${((r.lastPassageTime - leader.lastPassageTime) / 1000).toFixed(3)}s`
          : `+${leader.totalLaps - r.totalLaps} Tour${leader.totalLaps - r.totalLaps > 1 ? 's' : ''}`
        const interval = r.totalLaps === prev.totalLaps
          ? `+${((r.lastPassageTime - prev.lastPassageTime) / 1000).toFixed(3)}s`
          : `+${prev.totalLaps - r.totalLaps} Tour${prev.totalLaps - r.totalLaps > 1 ? 's' : ''}`
        return { ...r, gapToLeader, interval }
      })
    }
    return cache
  }, [teams, laps, session?.categories])

  // Meilleur tour absolu (durée min toutes équipes confondues). Dérivé du
  // memo des rankings → recompute uniquement quand les rankings changent.
  const { bestOverall, bestTeam } = useMemo(() => {
    let best = null, team = null
    for (const r of (rankingsCache.all || [])) {
      if (r.bestLap !== null && (best === null || r.bestLap < best)) {
        best = r.bestLap
        team = r
      }
    }
    return { bestOverall: best, bestTeam: team }
  }, [rankingsCache])

  // totalTeams (équipes ayant fait au moins 1 passage). Set + map = O(N) ;
  // memoizé pour ne pas recalculer à chaque tick d'elapsed.
  const totalTeams = useMemo(() => new Set(laps.map(l => l.team_id)).size, [laps])

  // Tracking des deltas de position (basé sur le ranking 'all' memoizé,
  // ne tourne donc QUE quand les rankings changent réellement).
  useEffect(() => {
    const current = rankingsCache.all || []
    if (current.length === 0) return
    const deltas = {}
    current.forEach((r, idx) => {
      const prev = prevRankingsRef.current[r.id]
      if (prev !== undefined && prev !== idx) deltas[r.id] = prev - idx
    })
    if (Object.keys(deltas).length > 0) {
      setPositionDeltas(deltas)
      setTimeout(() => setPositionDeltas({}), 5000)
    }
    const newPrev = {}
    current.forEach((r, idx) => { newPrev[r.id] = idx })
    prevRankingsRef.current = newPrev
  }, [rankingsCache])

  const handleShare = () => {
    const url = `${window.location.origin}?live=${session.id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }).catch(() => alert(`Lien : ${url}`))
  }

  const computeLapSplits = (riderLaps) =>
    riderLaps.map((lap, idx) => idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - riderLaps[idx - 1].lap_time_ms)

  const generateCard = (rankingsList) => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = Math.max(640, 220 + rankingsList.length * 58)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ff5500'; ctx.fillRect(0, 0, canvas.width, 6)
    ctx.fillStyle = '#ff5500'; ctx.font = 'bold 42px sans-serif'
    ctx.fillText('MOB Y DICK', 40, 70)
    ctx.fillStyle = '#ffffff'; ctx.font = '20px sans-serif'
    ctx.fillText(session?.name || 'Course', 40, 105)
    ctx.fillStyle = '#666'; ctx.font = '14px sans-serif'
    ctx.fillText(eventInfo ? `${eventInfo.location} • ${new Date(eventInfo.date).toLocaleDateString('fr-FR')}` : '', 40, 130)
    if (bestTeam) {
      ctx.fillStyle = '#a855f7'; ctx.font = 'bold 14px sans-serif'
      ctx.fillText(`⚡ Meilleur tour : ${bestTeam.pilot_1_name} — ${formatTime(bestOverall)}`, 40, 158)
    }
    rankingsList.slice(0, 10).forEach((r, i) => {
      const y = 200 + i * 56
      const colors = ['#ffd700', '#c0c0c0', '#cd7f32']
      ctx.fillStyle = i < 3 ? colors[i] : '#ffffff'
      ctx.font = `bold ${i < 3 ? 22 : 17}px sans-serif`
      ctx.fillText(`${i + 1}. ${r.pilot_1_name}${r.pilot_2_name ? ` & ${r.pilot_2_name}` : ''}`, 50, y)
      ctx.fillStyle = '#ff5500'; ctx.font = '15px monospace'
      ctx.fillText(`${r.totalLaps} tours  •  ${formatTime(r.bestLap)}`, 500, y)
      if (r.gapToLeader && i > 0) { ctx.fillStyle = '#888'; ctx.font = '13px sans-serif'; ctx.fillText(r.gapToLeader, 500, y + 18) }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(40, y + 22); ctx.lineTo(760, y + 22); ctx.stroke()
    })
    ctx.fillStyle = '#ff5500'; ctx.font = 'bold 15px sans-serif'
    ctx.fillText('mobydick.fr', 40, canvas.height - 24)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `resultats-mob-y-dick.png`
    a.click()
  }

  // Lecture du classement (wrapper sur le memo)
  const getRankings = (cat) => rankingsCache[cat] || []

  // ── Derived ──
  if (loading && !session) return (
    <section className="section page-top"><div className="container"><div className="live-loading"><div className="live-loading-spinner" /><p>Recherche d'une course en direct...</p></div></div></section>
  )
  if (!session) return (
    <section className="section page-top"><div className="container"><div className="live-no-race"><span className="live-no-race-icon">🏁</span><h2>Aucune course en cours</h2><p>Revenez lors du prochain événement pour suivre la course en direct !</p></div></div></section>
  )

  const categories   = session.categories || []
  const isLive       = session.status === 'live'
  const isFinished   = session.status === 'finished' || session.status === 'published'
  const allRankings  = getRankings(selectedCategory)
  const recentLaps   = laps.slice(0, 8)
  const totalLaps    = laps.length

  // ── Modes overlay : pré-course (drapeau "départ imminent") et post-course
  //    ("fin de la course" 5min + auto-exit). Calculés à partir du status
  //    et de started_at / finished_at de la session.
  const isPreRace  = session?.status === 'live'
                     && !session?.started_at
  // Post-race overlay = uniquement si l'utilisateur a vu la course passer
  // de 'live' à 'finished' pendant qu'il regardait (= il était là en
  // temps réel et mérite l'écran de clôture + countdown 5min).
  //
  // Si la session est DÉJÀ finished/published au mount (= visiteur qui
  // clique "🏆 Résultats" sur une course archivée), on saute l'overlay :
  // il veut voir les classements, pas un drapeau qui le redirige vers
  // l'accueil quand le countdown a expiré.
  //
  // `sawLive` (state) est mis à true par un useEffect dédié dès qu'on
  // observe status='live'. Si on arrive directement sur un status
  // finished/published, il reste à false → pas d'overlay.
  const isPostRace = sawLive
                     && (session?.status === 'finished' || session?.status === 'published')

  return (
    <section className="section page-top live-section">
      {/* Overlays drapeau damier (rendus via Portal en interne) */}
      {isPreRace && (
        <RaceFlagOverlay
          mode="pre-race"
          session={session}
          announcement={announcement}
          announcementsHistory={announcementsHistory}
          onClose={onClose}
        />
      )}
      {isPostRace && (
        <RaceFlagOverlay
          mode="post-race"
          session={session}
          onClose={onClose}
          onAutoExit={() => {
            // Soit on remonte au parent qui décide où aller, soit on tombe
            // sur onClose par défaut.
            if (onAutoExit) onAutoExit()
            else if (onClose) onClose()
          }}
        />
      )}
      {/* ── Overlays Live (dons, emotes premium, emojis flottants, annonces) ──
         Rendus dans un Portal sur document.body : la <section> parente a
         un transform résiduel (animation pageEnter) qui crée un containing
         block et casserait le position:fixed des overlays — du coup ils
         se retrouveraient placés au milieu de la section et non du
         viewport. Le portal court-circuite tout l'arbre transformé. */}
      {createPortal(
        <>
          {/* ── Active Alerts Container (dons) ──
             Une seule donation affichée à la fois (la tête de queue).
             Les suivantes attendent qu'elle disparaisse (8s). */}
          <div className="live-alerts-container live-donation-stage">
            {(() => {
              const head = activeAlerts.find(a => a.type === 'donation')
              if (!head) return null
              const queueRest = activeAlerts.filter(a => a.type === 'donation').length - 1
              const amount = head.amount || 0
              const isMega = amount >= 10
              // Retrouve le produit acheté pour personnaliser le texte
              // ("a offert une bière" au lieu du générique "vient d'offrir").
              // Null pour les anciens messages legacy sans item_slug.
              const purchasedItem = head.item_slug
                ? shopItems.find(s => s.slug === head.item_slug)
                : null
              return (
                <div key={head.id} className={`neon-donation-alert show ${isMega ? 'is-mega' : ''}`}>
                  <img
                    src="/emotes/neon_diamond.png"
                    alt=""
                    aria-hidden="true"
                    className="neon-icon"
                  />
                  <div className="neon-content">
                    <div className="neon-header">
                      {isMega ? '💎 MEGA SPONSOR 💎' : '💎 SPONSORING 💎'}
                      {queueRest > 0 && (
                        <span className="donation-alert-queue-badge">+{queueRest}</span>
                      )}
                    </div>
                    <div className="neon-main-text">
                      <strong>{head.display_name}</strong>{' '}
                      {purchasedItem
                        ? <>a choisi <strong>{purchasedItem.name}</strong> pour</>
                        : <>vient d'offrir</>}
                      {' '}
                      <span className="neon-amount">{amount}€</span> !
                    </div>
                    {head.message && (
                      <div className="neon-message">"{head.message}"</div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Premium Emote Overlays (une à la fois aussi) ── */}
          {activeAlerts.filter(a => a.type === 'premium-reaction').slice(0, 1).map(a => {
            // Priorité : ce que l'admin a uploadé dans Supabase (via EmoteAdmin)
            // GAGNE sur le hardcoded MEDIA_OVERRIDES — l'override n'est qu'un
            // fallback pour les emotes sans upload custom. Avant : l'override
            // forçait toujours le PNG, donc un MP4 uploadé n'apparaissait pas.
            const override = MEDIA_OVERRIDES[a.item.slug]
            const supabaseMedia = a.item.media_url || a.item.animation_url
            const mediaSrc = supabaseMedia || override?.mediaSrc
            const isVideo = supabaseMedia
              ? (a.item.media_type === 'mp4' || /\.(mp4|webm)($|\?)/i.test(supabaseMedia))
              : (override?.mediaType === 'mp4')
            // Classe CSS d'animation spécifique au slug — override emotePopIn
            // sur le wrapper (cf. règle :has() dans LiveRace.css).
            // ON N'APPLIQUE PAS la classe slug sur les vidéos : les keyframes
            // finissent en opacity:0 à 1-3s alors que la vidéo dure souvent
            // 5s+. L'image disparaîtrait avant la fin du clip. Les vidéos
            // ont déjà leur propre choré interne.
            const animClass = isVideo ? '' : (SLUG_ANIM_CLASS[a.item.slug] || '')
            // Son séparé : prio au sound_url Supabase, fallback sur l'override.
            const hasSeparateSound = !!(a.item.sound_url || (!supabaseMedia && override?.soundSrc))
            return (
              <div key={a.id} className="live-emote-overlay-stage">
                <div className="live-premium-emote-alert">
                  {mediaSrc && (
                    isVideo ? (
                      <video
                        src={mediaSrc}
                        className={`live-premium-emote-img ${animClass}`}
                        autoPlay
                        playsInline
                        /* Mute la vidéo SI un sound_url séparé est défini :
                           dans ce cas c'est le MP3 qui joue (cf. triggerPremiumReaction).
                           Sinon, le MP4 joue son propre son intégré. */
                        muted={hasSeparateSound}
                        onEnded={(e) => {
                          try { e.currentTarget.pause() } catch { /* ignore */ }
                          // Petite marge pour laisser respirer l'overlay text "X envoie Y!"
                          setTimeout(() => dismissAlertImmediately(a.id), 500)
                        }}
                      />
                    ) : (
                      <img src={mediaSrc} alt={a.item.name} className={`live-premium-emote-img ${animClass}`} />
                    )
                  )}
                  <div className="live-premium-emote-user">
                    <span>{a.userDisplayName}</span> envoie {a.item.name} !
                  </div>
                </div>
              </div>
            )
          })}

          {/* ── Floating emoji container ── */}
          <div className="live-emoji-stage" aria-hidden="true">
            {floatingEmojis.map(e => (
              <span key={e.id} className="live-emoji-float" style={{ left: `${e.x}%` }}>
                {e.emoji}
              </span>
            ))}
          </div>

          {/* ── Announcement banner ── */}
          {announcement && (
            <div className="live-announcement-banner glass">
              <span className="live-announcement-icon">📢</span>
              <span className="live-announcement-text">{announcement}</span>
            </div>
          )}
        </>,
        document.body
      )}

      <div className="container">
        {onClose && (
          <button className="btn btn-ghost" onClick={onClose} style={{ marginBottom: '15px', color: 'var(--accent)', fontWeight: 'bold' }}>
            ← Retour aux Événements
          </button>
        )}

        {/* ── Hero Banner ── */}
        <div className="live-hero glass">
          <div className="live-hero-bg" />
          <div className="live-hero-content">
            <div className="live-hero-left">
              {isLive && <div className="live-badge-big"><span className="live-dot-big" />LIVE</div>}
              {isFinished && <div className="live-badge-finished">🏁 {session.status === 'published' ? 'RÉSULTATS OFFICIELS' : 'COURSE TERMINÉE'}</div>}
              <h1 className="live-hero-title">{session.name}</h1>
              {eventInfo && (
                <p className="live-hero-event">📍 {eventInfo.location} — {new Date(eventInfo.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              )}
              {/* Share button */}
              <div className="live-hero-actions">
                <button className="btn btn-ghost live-share-btn" onClick={handleShare}>
                  {copied ? '✅ Lien copié !' : '🔗 Partager ce live'}
                </button>
                {isFinished && (
                  <button className="btn btn-ghost live-share-btn" onClick={() => generateCard(allRankings)} style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#a855f7' }}>
                    🖼️ Carte PNG
                  </button>
                )}
              </div>
            </div>
            <div className="live-hero-stats">
              <div className="live-stat">
                <span className="live-stat-value">{totalTeams}</span>
                <span className="live-stat-label">Équipes</span>
              </div>
              <div className="live-stat">
                <span className="live-stat-value">{totalLaps}</span>
                <span className="live-stat-label">Passages</span>
              </div>
              {isLive && (
                <div className="live-stat live-stat-elapsed">
                  <span className="live-stat-value">{formatElapsed(elapsed)}</span>
                  <span className="live-stat-label">Temps écoulé</span>
                </div>
              )}
              {isLive && (
                <div className="live-stat live-stat-spectators">
                  <span className="live-stat-value">
                    👁 {spectatorCount}
                    {/* Indicateur santé du canal Realtime : vert pulsé = temps
                        réel actif via WebSocket, jaune = fallback polling 3s
                        (couverture safe mais latence visible). */}
                    <span
                      className={`live-rt-pip ${channelHealthy ? 'is-live' : 'is-fallback'}`}
                      title={channelHealthy
                        ? 'Temps réel actif (WebSocket)'
                        : 'Fallback polling 3s — WebSocket en reconnexion'}
                      aria-label={channelHealthy ? 'Temps réel actif' : 'Polling fallback'}
                    />
                  </span>
                  <span className="live-stat-label">Spectateurs</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Stream vidéo live (broadcast par l'orga via Agora) ──
            Visible uniquement si session.live_stream_active=true. Tant qu'on
            n'a pas reçu la première frame, on affiche un placeholder. */}
        {session?.live_stream_active && (
          <div className="live-stream-card glass" style={{ marginBottom: '20px', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255,85,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', background: '#ff3b30', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                🎥 Diffusion en direct
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select 
                  value={videoQuality} 
                  onChange={(e) => setVideoQuality(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  <option value="auto">Qualité : Auto</option>
                  <option value="high">Max (Jusqu'à 2K)</option>
                  <option value="low">Éco (Data)</option>
                </select>
              </div>
            </div>
            <div ref={videoWrapperRef} style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '10px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div
                ref={streamDivRef}
                style={{ width: '100%', height: '100%', display: streamReceiving ? 'block' : 'none' }}
              />
              
              {streamReceiving && (
                <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '8px', zIndex: 20 }}>
                  <button 
                    onClick={() => setIsAudioMuted(!isAudioMuted)}
                    title={isAudioMuted ? "Activer le son" : "Couper le son"}
                    style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: '0.2s' }}
                  >
                    {isAudioMuted ? '🔇' : '🔊'}
                  </button>
                  <button 
                    onClick={toggleFullscreen}
                    title="Plein Écran"
                    style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: '0.2s' }}
                  >
                    ⛶
                  </button>
                </div>
              )}

              {!streamReceiving && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem' }}>📡</div>
                  <div style={{ fontSize: '0.9rem' }}>En attente du signal vidéo…</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>L'organisateur active sa caméra</div>
                </div>
              )}
            </div>
            {isAudioMuted && streamReceiving && (
               <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.85rem', color: '#ffb347', fontWeight: 'bold' }}>
                 🔇 Le son est désactivé. Cliquez sur le bouton dans la vidéo pour l'activer.
               </div>
            )}
          </div>
        )}

        {/* ── Best lap / Meilleur chrono ── */}
        {bestTeam && (
          <div className="live-best-overall glass">
            <span className="live-best-label">⚡ Meilleur Chrono Global</span>
            <div className="live-best-info">
              <span className="live-best-moto">#{bestTeam.moto_number}</span>
              <span className="live-best-pilot">{bestTeam.pilot_1_name}</span>
              <span className="live-best-time">{formatTime(bestOverall)}</span>
              <span className="live-best-cat">{bestTeam.category}</span>
            </div>
          </div>
        )}







        {/* ── Main View Tabs ── */}
        <div className="live-main-tabs" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '20px' }}>
          <button className={`live-cat-tab ${activeViewTab === 'classement' ? 'active' : ''}`} onClick={() => setActiveViewTab('classement')}>
            🏁 Classement
          </button>
          {(isFinished || allRankings.length > 0) && (
            <button className={`live-cat-tab ${activeViewTab === 'podiums' ? 'active' : ''}`} onClick={() => setActiveViewTab('podiums')}>
              🏆 Podiums
            </button>
          )}
          <button className={`live-cat-tab ${activeViewTab === 'activite' ? 'active' : ''}`} onClick={() => setActiveViewTab('activite')}>
            ⚡ Activité & Historique
          </button>
        </div>

        {/* ── Category tabs (used by both Classement and Podiums) ── */}
        {(activeViewTab === 'classement' || activeViewTab === 'podiums') && (
          <div className="live-cat-tabs">
            {['all', ...categories].map(c => (
              <button key={c} className={`live-cat-tab ${selectedCategory === c ? 'active' : ''}`} onClick={() => setSelectedCategory(c)}>
                {c === 'all' ? 'Toutes' : c}
              </button>
            ))}
          </div>
        )}

        <div className="live-content-container">
          {/* ── Onglet Classement ── */}
          {activeViewTab === 'classement' && (
            <div className="live-rankings-panel" style={{ width: '100%' }}>
              <div className="live-rankings-card glass">
              <h2 className="live-rankings-title">🏆 Classement {selectedCategory !== 'all' ? `— ${selectedCategory}` : 'Général'}</h2>

              {allRankings.length === 0 ? (
                <div className="live-rankings-empty"><p>En attente des premiers passages...</p></div>
              ) : (
                <div className="live-table-scroll">
                  <table className="live-table">
                    <thead>
                      <tr>
                        <th className="live-th-pos">POS</th>
                        <th className="live-th-delta" title="Évolution de position">±</th>
                        <th className="live-th-num">N°</th>
                        <th>PILOTE</th>
                        <th>CAT.</th>
                        <th className="live-th-time">MEILLEUR</th>
                        <th className="live-th-time">ÉCART 1ER</th>
                        <th className="live-th-time">INTERVALLE</th>
                        <th className="live-th-time">DERNIER</th>
                        <th className="live-th-time">MOY.</th>
                        <th>TOURS</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRankings.map((r, i) => {
                        const delta = positionDeltas[r.id]
                        const isBestLap = r.id === bestTeam?.id
                        const isExpanded = expandedRider === r.id
                        const isSelected = selectedTeamId === r.id
                        const splits = isExpanded ? computeLapSplits([...r.laps].sort((a, b) => a.lap_time_ms - b.lap_time_ms)) : []
                        const minSplit = splits.length ? Math.min(...splits) : null
                        return [
                          <tr
                            key={r.id}
                            className={`live-row live-row-clickable ${i < 3 ? `live-podium-${i + 1}` : ''} ${r.id === highlightedLap ? 'live-row-flash' : ''} ${isSelected ? 'live-row-selected' : ''}`}
                            onClick={() => setSelectedTeamId(isSelected ? null : r.id)}
                            title="Cliquer pour voir les temps au tour"
                          >
                            <td className="live-pos">
                              {i === 0 && <span className="live-medal gold">1</span>}
                              {i === 1 && <span className="live-medal silver">2</span>}
                              {i === 2 && <span className="live-medal bronze">3</span>}
                              {i > 2 && <span className="live-pos-num">{i + 1}</span>}
                            </td>
                            <td className="live-delta">
                              {delta > 0 && <span className="live-delta-up">▲{delta}</span>}
                              {delta < 0 && <span className="live-delta-down">▼{Math.abs(delta)}</span>}
                            </td>
                            <td className="live-num"><span className="live-num-badge">#{r.moto_number}</span></td>
                            <td className="live-pilot-cell">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div>
                                  <span className="live-pilot-name">{r.pilot_1_name}</span>
                                  {r.pilot_2_name && <span className="live-pilot-extra">{r.pilot_2_name}</span>}
                                </div>
                                {isBestLap && <span className="live-best-lap-badge" title="Meilleur tour de la course">⚡</span>}
                                {teamStatuses[r.id] === 'DNF' && <span className="live-status-dnf">DNF</span>}
                                {teamStatuses[r.id] === 'DNS' && <span className="live-status-dns">DNS</span>}
                              </div>
                            </td>
                            <td className="live-cat-cell"><span className="live-cat-badge">{r.category}</span></td>
                            <td className="live-time live-time-best">{formatTime(r.bestLap)}</td>
                            <td className="live-time" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: i === 0 ? 'bold' : 'normal' }}>{r.gapToLeader}</td>
                            <td className="live-time" style={{ color: 'var(--text-muted)' }}>{r.interval}</td>
                            <td className="live-time">{formatTime(r.lastLap)}</td>
                            <td className="live-time live-time-avg">{formatTime(r.avgLap)}</td>
                            <td className="live-laps">{r.totalLaps}</td>
                            <td>
                              <button
                                className="live-expand-btn"
                                onClick={(e) => { e.stopPropagation(); setExpandedRider(isExpanded ? null : r.id) }}
                                title={isExpanded ? 'Masquer les tours' : 'Voir tous les tours'}
                              >
                                {isExpanded ? '▲' : '▼'}
                              </button>
                            </td>
                          </tr>,
                          isExpanded && (
                            <tr key={`${r.id}-detail`} className="live-row-detail">
                              <td colSpan={12}>
                                <div className="live-lap-breakdown">
                                  <div className="live-lap-breakdown-title">Tours de {r.pilot_1_name}</div>
                                  <div className="live-lap-splits">
                                    {splits.map((ms, idx) => (
                                      <div key={idx} className={`live-lap-split-item ${ms === minSplit ? 'best-split' : ''}`}>
                                        <span className="split-num">T{idx + 1}</span>
                                        <span className="split-time">{formatTime(ms)}</span>
                                        {ms === minSplit && <span className="split-best-tag">⚡</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
          {/* ── Onglet Podiums ── */}
          {activeViewTab === 'podiums' && (
            <div className="live-podiums-section" style={{ width: '100%' }}>
                <h2 className="live-podiums-title">🏆 Podiums {selectedCategory !== 'all' ? `— ${selectedCategory}` : 'par Catégorie'}</h2>
                <div className="live-podiums-grid">
                  {(selectedCategory === 'all' ? categories : [selectedCategory]).map(cat => {
                    const catR = getRankings(cat)
                    if (!catR.length) return null
                    return (
                      <div key={cat} className="live-podium-card glass">
                        <h3 className="live-podium-cat">{cat}</h3>
                        <div className="live-podium-visual">
                          {catR[1] && (
                            <div className="live-podium-step step-2 podium-anim-2">
                              <div className="live-podium-avatar">🥈</div>
                              <span className="live-podium-name">{catR[1].pilot_1_name}</span>
                              <span className="live-podium-chrono">{catR[1].totalLaps} Tours</span>
                              <span className="live-podium-best">Min: {formatTime(catR[1].bestLap)}</span>
                              <div className="live-podium-block silver">2</div>
                            </div>
                          )}
                          {catR[0] && (
                            <div className="live-podium-step step-1 podium-anim-1">
                              <div className="live-podium-avatar">🥇</div>
                              <span className="live-podium-name">{catR[0].pilot_1_name}</span>
                              <span className="live-podium-chrono">{catR[0].totalLaps} Tours</span>
                              <span className="live-podium-best">Min: {formatTime(catR[0].bestLap)}</span>
                              <div className="live-podium-block gold">1</div>
                            </div>
                          )}
                          {catR[2] && (
                            <div className="live-podium-step step-3 podium-anim-3">
                              <div className="live-podium-avatar">🥉</div>
                              <span className="live-podium-name">{catR[2].pilot_1_name}</span>
                              <span className="live-podium-chrono">{catR[2].totalLaps} Tours</span>
                              <span className="live-podium-best">Min: {formatTime(catR[2].bestLap)}</span>
                              <div className="live-podium-block bronze">3</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          {/* ── Onglet Activité & Historique ── */}
          {activeViewTab === 'activite' && (
            <div className="live-sidebar" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
              
              {/* Historique des Annonces */}
              <div className="live-feed glass" style={{ marginBottom: '20px' }}>
                <h3 className="live-feed-title">📢 Historique des Événements</h3>
                <div className="live-feed-list" style={{ maxHeight: '300px' }}>
                  {announcementsHistory.length === 0 ? (
                    <div className="live-feed-empty">Aucun événement enregistré</div>
                  ) : (
                    announcementsHistory.map((ann) => (
                      <div key={ann.id} className="live-feed-item" style={{ padding: '12px', borderLeft: '4px solid var(--accent)' }}>
                        <div className="live-feed-time" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                          {new Date(ann.created_at).toLocaleTimeString('fr-FR')}
                        </div>
                        <div className="live-feed-name" style={{ fontSize: '1.05rem', color: '#fff', whiteSpace: 'pre-wrap' }}>
                          {ann.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent laps feed */}
              <div className="live-feed glass">
              <h3 className="live-feed-title">⚡ Derniers Passages</h3>
              <div className="live-feed-list">
                {recentLaps.map(l => {
                  const team = teams.find(t => t.id === l.team_id)
                  return (
                    <div key={l.id} className={`live-feed-item ${l.id === highlightedLap ? 'live-feed-new' : ''}`}>
                      <div className="live-feed-moto">#{l.moto_number}</div>
                      <div className="live-feed-details">
                        <span className="live-feed-name">{team?.pilot_1_name || '?'}</span>
                        <span className="live-feed-cat">{team?.category}</span>
                      </div>
                      <div className="live-feed-time">{formatTime(l.lap_time_ms)}</div>
                    </div>
                  )
                })}
                {recentLaps.length === 0 && <div className="live-feed-empty">Aucun passage enregistré</div>}
              </div>
            </div>

            {/* Stats */}
            <div className="live-stats-card glass">
              <h3>📊 Statistiques</h3>
              <div className="live-stats-grid">
                <div className="live-stats-item"><span className="live-stats-val">{teams.length}</span><span className="live-stats-lbl">Inscrits</span></div>
                <div className="live-stats-item"><span className="live-stats-val">{totalTeams}</span><span className="live-stats-lbl">En piste</span></div>
                <div className="live-stats-item"><span className="live-stats-val">{totalLaps}</span><span className="live-stats-lbl">Passages</span></div>
                <div className="live-stats-item"><span className="live-stats-val">{categories.length}</span><span className="live-stats-lbl">Catégories</span></div>
              </div>
            </div>

            {/* Emoji reactions — live only */}
            {isLive && (
              <div className="live-reactions glass">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 className="live-reactions-title" style={{ margin: 0 }}>💬 Réagir</h3>
                  <button className="live-premium-support-btn" onClick={() => { setShopCategoryFilter('sponsoring'); setShopOpen(true); }}>
                    🏍️ Sponsoriser la Team
                  </button>
                </div>
                <div className="live-reactions-grid">
                  {EMOJIS.map(emoji => (
                    <button key={emoji} className="live-reaction-btn" onClick={() => sendReaction(emoji)} aria-label={`Réaction ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Premium Reactions */}
                <div className="live-reactions-premium-header">
                  <span className="live-reactions-premium-title">💎 Animations Premium</span>
                  <button className="live-premium-support-btn" onClick={() => { setShopCategoryFilter('emote'); setShopOpen(true); }}>
                    🛍️ Boutique
                  </button>
                </div>
                <div className="live-reactions-premium-grid">
                  {shopItems.filter(item => item.type !== 'pack' && (item.category || 'emote') === 'emote').map(item => {
                    const isOwned = userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all');
                    return (
                      <button
                        key={item.id}
                        className={`live-reaction-btn-premium ${!isOwned ? 'locked' : ''}`}
                        onClick={() => {
                          if (isOwned) {
                            sendPremiumReaction(item);
                          } else {
                            setShopCategoryFilter('emote');
                            setShopOpen(true);
                          }
                        }}
                        title={isOwned ? `Lancer l'animation ${item.name}` : `Débloquer ${item.name} (${item.price_cents / 100}€)`}
                      >
                        {item.emoji || '🔊'}
                        {!isOwned && (
                          <span className="live-lock-badge">🔒</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer équipe sélectionnée ── */}
      {selectedTeamId && (() => {
        const selIdx  = allRankings.findIndex(r => r.id === selectedTeamId)
        const selTeam = allRankings[selIdx]
        if (!selTeam) return null
        return (
          <LiveTeamDrawer
            team={selTeam}
            allLaps={laps}
            position={selIdx + 1}
            onClose={() => setSelectedTeamId(null)}
          />
        )
      })()}

      {/* ── Boutique Live ──
         Rendue via Portal sur document.body : sinon le `transform` de la
         section parente (animation pageEnter qui se fige en translateY(0))
         crée un containing block et casse le `position: fixed` du overlay
         → la modal apparaît au milieu/bas de la section au lieu d'être
         centrée sur le viewport, surtout visible sur mobile où la section
         est plus haute que l'écran.

         Un seul écran, filtres par catégorie (toutes / emotes / sponsoring).
         Plus aucun montant libre : chaque achat passe par un produit
         shop_items à prix fixe (conformité Stripe v26). Le sponsoring
         (bière, bougie, mélange, huile, pneu) ouvre une modal avec pseudo
         + message custom comme l'ancien formulaire de don. */}
      {shopOpen && createPortal(
        <div className="premium-modal-overlay" onClick={() => setShopOpen(false)}>
          <div className="premium-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="premium-modal-header">
              <div className="premium-modal-title-area">
                <h2>🛍️ Boutique Live</h2>
                <p className="premium-modal-subtitle">Animez le direct avec nos emotes et sponsorisez la team !</p>
              </div>
              <button className="btn btn-ghost" onClick={() => setShopOpen(false)} style={{ padding: '4px 8px', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Filtres par catégorie — remplace les anciens onglets Boutique/Don */}
            <div className="premium-modal-tabs">
              {[
                { key: 'all',         label: '🛒 Tout' },
                { key: 'emote',       label: '🎭 Emotes' },
                { key: 'sponsoring',  label: '🏍️ Sponsoring' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`premium-modal-tab ${shopCategoryFilter === key ? 'active' : ''}`}
                  onClick={() => setShopCategoryFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="premium-modal-content">
              <div className="premium-shop-grid">
                {!authUser && shopCategoryFilter === 'emote' && (
                  <div style={{ padding: '15px', background: 'rgba(255,85,0,0.1)', border: '1px solid var(--accent)', borderRadius: '12px', textAlign: 'center', marginBottom: '15px', color: '#fff' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem' }}>💡 Connecte-toi pour acheter et débloquer définitivement des emotes premium. Le sponsoring peut être acheté sans compte.</p>
                  </div>
                )}
                {shopItems
                  .filter(item => shopCategoryFilter === 'all' || (item.category || 'emote') === shopCategoryFilter)
                  .map(item => {
                    // Seuls les items non-repeatable peuvent être "owned" (emotes / packs).
                    // Les services repeatable (sponsoring) sont achetables N fois.
                    const isRepeatable = !!item.repeatable;
                    const isOwned = !isRepeatable && (userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all'));
                    const isPack = item.type === 'pack';
                    const isEmoteCategory = (item.category || 'emote') === 'emote';
                    return (
                      <div key={item.id} className={`premium-shop-card ${isOwned ? 'owned' : ''} ${isPack ? 'pack-card' : ''}`}>
                        <div className="premium-shop-card-emoji">
                          {item.emoji || '🛒'}
                        </div>
                        <div className="premium-shop-card-info">
                          <h3 className="premium-shop-card-title">
                            {item.name} {isPack && <span style={{ fontSize: '0.75rem', background: '#ffd700', color: '#000', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold' }}>PACK ULTIME</span>}
                          </h3>
                          <p className="premium-shop-card-desc">{item.description}</p>
                        </div>
                        <div className="premium-shop-card-action">
                          {isOwned ? (
                            <span className="premium-shop-owned-badge">✓ Débloqué</span>
                          ) : (isEmoteCategory && !authUser) ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Connexion requise
                            </span>
                          ) : (
                            <div style={{ width: '100%', minWidth: '120px' }}>
                              <Suspense fallback={<button className="btn btn-primary" style={{ width: '100%', opacity: 0.6 }} disabled>⏳…</button>}>
                                <StripePurchaseButton
                                  item={item}
                                  sessionId={session?.id || null}
                                  authUser={authUser}
                                  authUserDisplayName={userProfile?.display_name || null}
                                  isAdmin={userProfile?.role === 'admin'}
                                  onPurchased={() => { if (authUser) fetchUserPurchases(authUser.id) }}
                                />
                              </Suspense>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Outil admin : simulation d'achat sur le live (pas de débit) */}
              {userProfile?.role === 'admin' && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ marginTop: '15px', width: '100%', borderColor: '#ff5555', color: '#ff5555' }}
                  onClick={async () => {
                    // Legacy name 'admin-simulate-donation' compatible avec
                    // l'Edge Function actuelle ET avec la nouvelle (v26+).
                    const { data, error } = await supabase.functions.invoke('stripe-donation', {
                      body: {
                        action: 'admin-simulate-donation',
                        displayName: userProfile?.display_name || 'Admin Simu',
                        amountCents: 500,
                        message: 'Simulation d\'achat (Admin) — test d\'overlay live',
                        sessionId: session?.id || null,
                        itemSlug: 'sponsor_beer',
                      },
                    });
                    if (error || !data?.ok) {
                      let detail = error?.message || data?.error || 'inconnu';
                      if (error?.context) {
                        try {
                          const body = await error.context.json();
                          detail = body?.error || body?.detail || detail;
                        } catch { /* non-JSON */ }
                      }
                      toast.error('Simulation échouée : ' + detail);
                      return;
                    }
                    setShopOpen(false);
                  }}
                >
                  🧪 Simuler un Achat sur le Live (Admin)
                </button>
              )}

              <div style={{ marginTop: '15px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
                <p style={{ margin: 0 }}>Chaque achat est un service de divertissement à prix fixe (animation live, sponsoring symbolique avec message lu à l'antenne).</p>
                <p style={{ margin: '4px 0 0 0' }}>Paiement sécurisé via Stripe. Achat ferme et définitif, sans remboursement ultérieur (service immédiat consommé en direct).</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Floating Action Button (FAB) pour Emotes & Dons ──
         Également rendu via Portal (même raison : transform du parent
         cassait le position:fixed du FAB). */}
      {isLive && !shopOpen && createPortal(
        <div className="live-fab-container">
          {fabOpen && (
            <div
              className="live-fab-menu glass"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="live-fab-menu-title">💬 Réactions rapides</div>
              <div className="live-fab-emoji-row">
                {EMOJIS.map(emoji => (
                  <button key={emoji} className="live-reaction-btn" onClick={() => sendReaction(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="live-fab-divider" />
              <div className="live-fab-menu-title">💎 Premium</div>
              <div className="live-fab-emoji-row">
                {shopItems.filter(item => item.type !== 'pack' && (item.category || 'emote') === 'emote').map(item => {
                  const isOwned = userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all');
                  return (
                    <button
                      key={item.id}
                      className={`live-reaction-btn ${!isOwned ? 'locked' : ''}`}
                      onClick={() => {
                        if (isOwned) {
                          sendPremiumReaction(item);
                        } else {
                          setShopCategoryFilter('emote'); setShopOpen(true); setFabOpen(false);
                        }
                      }}
                      title={isOwned ? item.name : `Débloquer ${item.name}`}
                    >
                      {item.emoji || '🔊'}
                      {!isOwned && <span className="live-lock-badge" style={{fontSize:'0.55rem'}}>🔒</span>}
                    </button>
                  );
                })}
              </div>
              <div className="live-fab-divider" />
              <div className="live-fab-actions">
                <button className="live-fab-action-btn" onClick={() => { setShopCategoryFilter('all'); setShopOpen(true); setFabOpen(false); }}>
                  🛍️ Boutique
                </button>
                <button className="live-fab-action-btn donation" onClick={() => { setShopCategoryFilter('sponsoring'); setShopOpen(true); setFabOpen(false); }}>
                  🏍️ Sponsoriser
                </button>
              </div>

              {/* ── Toggle TTS (lecture vocale des dons) ── */}
              <div className="live-fab-divider" />
              <button
                type="button"
                className="live-fab-tts-toggle"
                onClick={() => {
                  const newState = !isDonationTTSEnabled()
                  setDonationTTSEnabled(newState)
                  // Force re-render via le state du fabOpen (hack léger)
                  setFabOpen(o => o)
                  // Test vocal pour confirmer l'activation
                  if (newState) {
                    setTimeout(() => speakDonation({
                      display_name: 'Test',
                      amount: 0,
                      message: 'La lecture vocale des messages live est activée.',
                    }, { force: true }), 100)
                  }
                }}
                title={isDonationTTSEnabled() ? 'Désactiver la lecture vocale des messages live' : 'Activer la lecture vocale des messages live'}
              >
                {isDonationTTSEnabled() ? '🔊 Lecture des messages : ON' : '🔇 Lecture des messages : OFF'}
              </button>
            </div>
          )}
          <button
            type="button"
            className={`live-fab-btn ${fabOpen ? 'active' : ''}`}
            onPointerUp={(e) => {
              // PointerUp est unifié (touch + souris) et fire UNE seule fois
              // par geste. On debounce en plus avec une fenêtre de 350ms
              // au cas où onClick remonterait quand même derrière (certains
              // Android Chrome continuent à émettre les deux).
              e.stopPropagation()
              e.preventDefault()
              const now = Date.now()
              if (now - fabLastToggleRef.current < 350) return
              fabLastToggleRef.current = now
              setFabOpen(o => !o)
            }}
            onClick={(e) => {
              // onClick est conservé pour l'accessibilité clavier (Enter/Space).
              // On debounce sur la même ref que onPointerUp pour ignorer le
              // click synthétique qui suit le tap mobile.
              e.stopPropagation()
              const now = Date.now()
              if (now - fabLastToggleRef.current < 350) return
              fabLastToggleRef.current = now
              setFabOpen(o => !o)
            }}
            aria-label={fabOpen ? 'Fermer le menu' : 'Boutique Live'}
          >
            <span className="live-fab-icon">{fabOpen ? '✕' : '🎉'}</span>
            <span className="live-fab-label">{fabOpen ? 'Fermer' : 'Réactions'}</span>
          </button>
        </div>,
        document.body
      )}

      {/* ── Audio Unlock Overlay ── */}
      {!audioUnlocked && (
        <div className="audio-unlock-overlay" onClick={unlockAudio}>
          <div className="audio-unlock-modal glass">
            <h2>🔔 Son désactivé</h2>
            <p>Cliquez pour activer le son et rejoindre le Live !</p>
            <button className="btn btn-primary" style={{ padding: '15px 30px', fontSize: '1.2rem', marginTop: '10px' }} onClick={unlockAudio}>
              Rejoindre le Live
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
