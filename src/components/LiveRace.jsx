import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LiveTeamDrawer from './LiveTeamDrawer'
import PayPalButton from './PayPalButton'
import { playPremiumSound, playDonationSound } from '../utils/soundEffects'
import './LiveRace.css'

const EMOJIS = ['🔥', '👏', '🏁', '🏍️', '⚡', '🤙', '😱', '🚀']

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

const formatElapsed = (ms) => {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
}

export default function LiveRace({ customSessionId, onClose }) {
  const [session, setSession]               = useState(null)
  const [teams, setTeams]                   = useState([])
  const [laps, setLaps]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [highlightedLap, setHighlightedLap] = useState(null)
  const [eventInfo, setEventInfo]           = useState(null)
  const [elapsed, setElapsed]               = useState(0)
  const [streamFrame, setStreamFrame]       = useState(null)

  // ── New features ──
  const [spectatorCount, setSpectatorCount] = useState(1)
  const [floatingEmojis, setFloatingEmojis] = useState([])
  const [announcement, setAnnouncement]     = useState(null)
  const [positionDeltas, setPositionDeltas] = useState({}) // teamId → signed int
  const [expandedRider, setExpandedRider]   = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null) // drawer latéral
  const [copied, setCopied]                 = useState(false)
  const [teamStatuses, setTeamStatuses]     = useState({}) // teamId → 'DNF' | 'DNS'
  
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
  const [modalTab, setModalTab] = useState('shop') // 'shop' | 'donation'
  const [fabOpen, setFabOpen] = useState(false) // floating action button

  // Donation form state
  const [donationPseudo, setDonationPseudo] = useState('')
  const [donationMessage, setDonationMessage] = useState('')
  const [donationAmount, setDonationAmount] = useState(5)
  const [customAmount, setCustomAmount] = useState('')

  // ── Audio unlock for mobile browsers ──
  const audioUnlockedRef = useRef(false)
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return
      // Play a tiny silent sound to unlock the audio context on mobile
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const buf = ctx.createBuffer(1, 1, 22050)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start(0)
        audioUnlockedRef.current = true
      } catch(e) { /* ignore */ }
    }
    document.addEventListener('click', unlockAudio, { once: true })
    document.addEventListener('touchstart', unlockAudio, { once: true })
    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
    }
  }, [])

  const elapsedRef          = useRef(null)
  const prevRankingsRef     = useRef({})
  const extrasChannelRef    = useRef(null)

  // ── Video stream ──
  const [isLiveStreamActive, setIsLiveStreamActive] = useState(session?.live_stream_active || false)
  const streamTimeoutRef = useRef(null)

  // Listen for live_stream_active changes in real-time
  useEffect(() => {
    if (!session?.id) return
    setIsLiveStreamActive(session.live_stream_active || false)

    const ch = supabase.channel(`live-status-viewer-${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_sessions', filter: `id=eq.${session.id}` }, ({ new: row }) => {
        const active = row.live_stream_active || false
        setIsLiveStreamActive(active)
        if (!active) setStreamFrame(null)
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [session?.id])

  // Subscribe to video frames
  useEffect(() => {
    if (!isLiveStreamActive || !session?.id) { setStreamFrame(null); return }

    const ch = supabase.channel(`live-stream-${session.id}`)
      .on('broadcast', { event: 'video-frame' }, ({ payload }) => {
        if (payload?.image) {
          setStreamFrame(payload.image)
          // Reset timeout — if no frame in 5s, assume stream died
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
          streamTimeoutRef.current = setTimeout(() => {
            setStreamFrame(null)
          }, 5000)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    }
  }, [isLiveStreamActive, session?.id])

  // ── Premium Shop & Alert Refs ──
  const shopItemsRef = useRef([])
  useEffect(() => {
    shopItemsRef.current = shopItems
  }, [shopItems])

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

  const triggerPremiumReaction = (slug, userDisplayName) => {
    const item = shopItemsRef.current.find(i => i.slug === slug)
    if (!item) return

    const alertId = Date.now() + Math.random()
    
    // Add to active alerts
    setActiveAlerts(prev => [...prev, {
      id: alertId,
      type: 'premium-reaction',
      item,
      userDisplayName
    }])

    // Play sound using Web Audio API (no external files, no CORS)
    playPremiumSound(slug)

    // Auto-remove after 4.5 seconds
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== alertId))
    }, 4500)
  }

  const triggerDonationAlert = (row) => {
    const alertId = Date.now() + Math.random()
    
    setActiveAlerts(prev => [...prev, {
      id: alertId,
      type: 'donation',
      display_name: row.display_name,
      amount: row.amount_cents / 100,
      message: row.message
    }])

    // Play cash register sound using Web Audio API
    playDonationSound()

    // Auto-remove after 8 seconds
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== alertId))
    }, 8000)
  }

  const sendPremiumReaction = (item) => {
    const nameToUse = userProfile?.display_name || authUser?.email?.split('@')[0] || 'Un Rider'
    // 1. Trigger locally
    triggerPremiumReaction(item.slug, nameToUse)
    // 2. Broadcast
    extrasChannelRef.current?.send({
      type: 'broadcast',
      event: 'premium-reaction',
      payload: { slug: item.slug, userDisplayName: nameToUse }
    })
  }

  const handleDonationSuccess = async (details, orderId, pseudo, msg, amount) => {
    try {
      const { error } = await supabase.from('donations').insert([{
        user_id: authUser ? authUser.id : null,
        display_name: pseudo || 'Donateur Anonyme',
        amount_cents: Math.round(amount * 100),
        message: msg || '',
        session_id: session?.id || null,
        paypal_order_id: orderId
      }])
      if (error) throw error
      
      setShopOpen(false)
      setDonationPseudo('')
      setDonationMessage('')
      setCustomAmount('')
      alert(`Merci infiniment pour ton don de ${amount}€ ! Ton message va s'afficher en direct.`);
    } catch (err) {
      alert("Erreur lors de l'enregistrement de ton don : " + err.message)
    }
  }

  const handlePremiumPurchaseSuccess = async (details, orderId, item) => {
    if (!authUser) return
    try {
      const { error } = await supabase.from('user_purchases').insert([{
        user_id: authUser.id,
        item_slug: item.slug,
        paypal_order_id: orderId,
        amount_cents: item.price_cents
      }])
      if (error) throw error
      
      await fetchUserPurchases(authUser.id)
      alert(`Génial ! Tu as débloqué : ${item.name} ! Tu peux maintenant l'utiliser en direct sur le Live.`);
    } catch (err) {
      alert("Erreur lors de la validation de ton achat : " + err.message)
    }
  }

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
  useEffect(() => {
    if (!session?.id) return
    const ch = supabase.channel(`live_race_public_${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_laps', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setLaps(prev => [row, ...prev])
        setHighlightedLap(row.id)
        setTimeout(() => setHighlightedLap(null), 4000)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${session.id}` }, ({ new: row }) => {
        setSession(row)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_announcements', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setAnnouncementsHistory(prev => [row, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'donations', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        triggerDonationAlert(row)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [session?.id])

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
        setTimeout(() => setAnnouncement(null), 12000)
      })
      .on('broadcast', { event: 'team-status' }, ({ payload }) => {
        setTeamStatuses(prev => ({ ...prev, [payload.teamId]: payload.status }))
      })
      .on('broadcast', { event: 'premium-reaction' }, ({ payload }) => {
        triggerPremiumReaction(payload.slug, payload.userDisplayName)
      })
      .subscribe()
    extrasChannelRef.current = ch
    return () => supabase.removeChannel(ch)
  }, [session?.id])

  // ── Elapsed timer ──
  useEffect(() => {
    if (session?.started_at && session?.status === 'live') {
      elapsedRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(session.started_at).getTime())
      }, 1000)
    }
    return () => clearInterval(elapsedRef.current)
  }, [session])

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

  // ── Track position changes when laps update ──
  const getRankingsForAll = useCallback(() => {
    return teams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const totalLaps = teamLaps.length
      const durations = totalLaps > 0
        ? teamLaps.map((lap, idx) => idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms)
        : []
      return {
        ...team,
        totalLaps,
        bestLap: durations.length ? Math.min(...durations) : null,
        lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity
      }
    })
    .filter(t => t.totalLaps > 0)
    .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)
  }, [teams, laps])

  useEffect(() => {
    if (laps.length === 0 || teams.length === 0) return
    const current = getRankingsForAll()
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
  }, [laps, teams, getRankingsForAll])

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

  // ── Rankings computation ──
  const getRankings = (cat) => {
    const catTeams = cat === 'all' ? teams : teams.filter(t => t.category === cat)
    const sorted = catTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const totalLaps = teamLaps.length
      let bestLap = null, lastLap = null, avgLap = null
      if (totalLaps > 0) {
        const durations = teamLaps.map((lap, idx) => idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms)
        bestLap = Math.min(...durations)
        lastLap = durations[totalLaps - 1]
        avgLap = Math.round(teamLaps[totalLaps - 1].lap_time_ms / totalLaps)
      }
      return { ...team, bestLap, avgLap, lastLap, totalLaps, laps: teamLaps, lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)

    return sorted.map((r, index) => {
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

  const getFemaleWinner = () => {
    const femaleTeams = teams.filter(t => t.pilot_1_sex === 'F' || t.pilot_2_sex === 'F' || t.pilot_3_sex === 'F')
    if (!femaleTeams.length) return null
    return femaleTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const totalLaps = teamLaps.length
      const durations = totalLaps > 0 ? teamLaps.map((lap, idx) => idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms) : []
      return { ...team, totalLaps, bestLap: durations.length ? Math.min(...durations) : null, lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)[0] || null
  }

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
  const totalTeams   = new Set(laps.map(l => l.team_id)).size
  const bestOverall  = laps.length > 0 ? Math.min(...laps.map(l => l.lap_time_ms)) : null
  const bestTeam     = bestOverall ? teams.find(t => t.id === laps.find(l => l.lap_time_ms === bestOverall)?.team_id) : null

  return (
    <section className="section page-top live-section">
      {/* ── Active Alerts Container ── */}
      <div className="live-alerts-container">
        {activeAlerts.filter(a => a.type === 'donation').map(a => (
          <div key={a.id} className="live-donation-alert">
            <div className="donation-alert-header">
              💎 SUPER CHAT 💎
            </div>
            <div className="donation-alert-body">
              <span>{a.display_name}</span> a donné {a.amount}€ !
            </div>
            {a.message && (
              <div className="donation-alert-message">
                "{a.message}"
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Premium Emote Overlays ── */}
      {activeAlerts.filter(a => a.type === 'premium-reaction').map(a => (
        <div key={a.id} className="live-emote-overlay-stage">
          <div className="live-premium-emote-alert">
            {a.item.animation_url && (
              <img src={a.item.animation_url} alt={a.item.name} className="live-premium-emote-img" />
            )}
            <div className="live-premium-emote-user">
              <span>{a.userDisplayName}</span> envoie {a.item.name} !
            </div>
          </div>
        </div>
      ))}

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
                  <span className="live-stat-value">👁 {spectatorCount}</span>
                  <span className="live-stat-label">Spectateurs</span>
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* ── Gagnante féminine ── */}
        {(() => {
          const fw = getFemaleWinner()
          if (!fw) return null
          const names = [fw.pilot_1_sex === 'F' && fw.pilot_1_name, fw.pilot_2_sex === 'F' && fw.pilot_2_name, fw.pilot_3_sex === 'F' && fw.pilot_3_name].filter(Boolean)
          return (
            <div className="live-best-overall glass" style={{ border: '1px solid rgba(255,0,128,0.3)', background: 'linear-gradient(90deg,rgba(255,0,128,0.08),rgba(0,0,0,0.2))', marginTop: '10px' }}>
              <span className="live-best-label" style={{ color: '#ff3399' }}>👑 Gagnante Féminine Toute Catégorie</span>
              <div className="live-best-info">
                <span className="live-best-moto" style={{ color: '#ff3399' }}>#{fw.moto_number}</span>
                <span className="live-best-pilot">{names.join(' & ')}</span>
                <span className="live-best-time" style={{ color: '#ff3399' }}>{fw.totalLaps} Tours</span>
                <span className="live-best-cat">Min: {formatTime(fw.bestLap)}</span>
              </div>
            </div>
          )
        })()}

        {/* ── Video stream ── */}
        {isLiveStreamActive && (
          <div className="live-video-container glass" style={{ marginBottom: '30px', padding: '20px', borderRadius: '16px', border: '1px solid var(--accent)', background: 'rgba(255,85,0,0.03)', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <span style={{ width: '10px', height: '10px', background: '#ff3b30', borderRadius: '50%', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>🎥 EN DIRECT DE LA PISTE</h3>
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: '960px', margin: '0 auto', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
              {streamFrame
                ? <img src={streamFrame} alt="Live" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Connexion au flux vidéo...</div>
              }
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
                  <button className="live-premium-support-btn" onClick={() => { setModalTab('donation'); setShopOpen(true); }}>
                    💸 Faire un Don
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
                  <button className="live-premium-support-btn" onClick={() => { setModalTab('shop'); setShopOpen(true); }}>
                    🛍️ Boutique
                  </button>
                </div>
                <div className="live-reactions-premium-grid">
                  {shopItems.filter(item => item.type !== 'pack').map(item => {
                    const isOwned = userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all');
                    return (
                      <button
                        key={item.id}
                        className={`live-reaction-btn-premium ${!isOwned ? 'locked' : ''}`}
                        onClick={() => {
                          if (isOwned) {
                            sendPremiumReaction(item);
                          } else {
                            setModalTab('shop');
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

      {/* ── Boutique & SuperChat Modal ── */}
      {shopOpen && (
        <div className="premium-modal-overlay" onClick={() => setShopOpen(false)}>
          <div className="premium-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="premium-modal-header">
              <div className="premium-modal-title-area">
                <h2>💎 Boutique & SuperChat Live</h2>
                <p className="premium-modal-subtitle">Soutenez l'événement et animez le direct !</p>
              </div>
              <button className="btn btn-ghost" onClick={() => setShopOpen(false)} style={{ padding: '4px 8px', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div className="premium-modal-tabs">
              <button
                className={`premium-modal-tab ${modalTab === 'shop' ? 'active' : ''}`}
                onClick={() => setModalTab('shop')}
              >
                🛍️ Boutique Emotes
              </button>
              <button
                className={`premium-modal-tab ${modalTab === 'donation' ? 'active' : ''}`}
                onClick={() => setModalTab('donation')}
              >
                💸 Envoyer un Don
              </button>
            </div>

            <div className="premium-modal-content">
              {modalTab === 'shop' && (
                <div className="premium-shop-grid">
                  {!authUser && (
                    <div style={{ padding: '15px', background: 'rgba(255,85,0,0.1)', border: '1px solid var(--accent)', borderRadius: '12px', textAlign: 'center', marginBottom: '15px', color: '#fff' }}>
                      <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem' }}>💡 Connectez-vous à votre compte pour acheter des emotes premium et les débloquer définitivement.</p>
                    </div>
                  )}
                  {shopItems.map(item => {
                    const isOwned = userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all');
                    const isPack = item.type === 'pack';
                    return (
                      <div key={item.id} className={`premium-shop-card ${isOwned ? 'owned' : ''} ${isPack ? 'pack-card' : ''}`}>
                        <div className="premium-shop-card-emoji">
                          {item.emoji || '🔊'}
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
                          ) : (
                            <>
                              <span className="premium-shop-price">{item.price_cents / 100}€</span>
                              {authUser ? (
                                <div style={{ width: '100%', minWidth: '120px' }}>
                                  <PayPalButton
                                    amount={(item.price_cents / 100).toFixed(2)}
                                    onSuccess={(details, orderId) => handlePremiumPurchaseSuccess(details, orderId, item)}
                                  />
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Connexion requise</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {modalTab === 'donation' && (
                <div className="donation-form">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label>Pseudo (Affiché à l'écran)</label>
                      <input
                        type="text"
                        placeholder="Ex: Rider44"
                        value={donationPseudo}
                        onChange={(e) => setDonationPseudo(e.target.value)}
                        maxLength={25}
                      />
                    </div>
                    <div>
                      <label>Montant du Don</label>
                      <div className="donation-input-wrapper">
                        <input
                          type="number"
                          min="1"
                          placeholder="Montant libre"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setDonationAmount(parseFloat(e.target.value) || 0);
                          }}
                        />
                        <span className="donation-currency-symbol">€</span>
                      </div>
                    </div>
                  </div>

                  <div className="donation-amount-grid">
                    {[5, 10, 20, 50].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className={`donation-amount-btn ${donationAmount === amt && !customAmount ? 'active' : ''}`}
                        onClick={() => {
                          setDonationAmount(amt);
                          setCustomAmount('');
                        }}
                      >
                        {amt}€
                      </button>
                    ))}
                  </div>

                  <div>
                    <label>Message de soutien (S'affichera en direct)</label>
                    <textarea
                      placeholder="Votre message personnalisé..."
                      rows={3}
                      value={donationMessage}
                      onChange={(e) => setDonationMessage(e.target.value)}
                      maxLength={120}
                    />
                  </div>

                  <div className="donation-summary-card">
                    Don de <strong>{donationAmount > 0 ? donationAmount : 0}€</strong> par <strong>{donationPseudo || 'Anonyme'}</strong>
                  </div>

                  {donationAmount > 0 ? (
                    <div style={{ marginTop: '10px' }}>
                      <PayPalButton
                        amount={donationAmount.toFixed(2)}
                        onSuccess={(details, orderId) => handleDonationSuccess(details, orderId, donationPseudo, donationMessage, donationAmount)}
                      />
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Indiquez un montant pour faire un don.
                    </div>
                  )}

                  <div style={{ marginTop: '15px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
                    <p style={{ margin: 0 }}>En effectuant ce don manuel, vous soutenez directement l'événement et l'équipe Mob Y Dick.</p>
                    <p style={{ margin: '4px 0 0 0' }}>Conformément à la législation, ce don est définitif, volontaire, et ne donne droit à aucun remboursement ultérieur ou contrepartie physique.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Action Button (FAB) pour Emotes & Dons ── */}
      {isLive && !shopOpen && (
        <div className="live-fab-container">
          {fabOpen && (
            <div className="live-fab-menu glass fade-in">
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
                {shopItems.filter(item => item.type !== 'pack').map(item => {
                  const isOwned = userPurchases.includes(item.slug) || userPurchases.includes('pack_premium_all');
                  return (
                    <button
                      key={item.id}
                      className={`live-reaction-btn ${!isOwned ? 'locked' : ''}`}
                      onClick={() => {
                        if (isOwned) {
                          sendPremiumReaction(item);
                        } else {
                          setModalTab('shop'); setShopOpen(true); setFabOpen(false);
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
                <button className="live-fab-action-btn" onClick={() => { setModalTab('shop'); setShopOpen(true); setFabOpen(false); }}>
                  🛍️ Boutique
                </button>
                <button className="live-fab-action-btn donation" onClick={() => { setModalTab('donation'); setShopOpen(true); setFabOpen(false); }}>
                  💸 Faire un Don
                </button>
              </div>
            </div>
          )}
          <button
            className={`live-fab-btn ${fabOpen ? 'active' : ''}`}
            onClick={() => setFabOpen(!fabOpen)}
            aria-label="Emotes et Dons"
          >
            {fabOpen ? '✕' : '🎉'}
          </button>
        </div>
      )}
    </section>
  )
}
