import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import './RaceChrono.css'

const formatTime = (ms, showMillis = true) => {
  if (!ms && ms !== 0) return showMillis ? '--:--.---' : '--:--:--'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  if (hours > 0) {
    return showMillis ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}` : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return showMillis ? `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}` : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// XXL Numpad digits layout
const NUMPAD_KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['⌫', '0', '✓'],
]

// UUID v4 (préfère crypto.randomUUID, fallback robuste sur vieux WebViews mobiles)
const genClientId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback : pas un v4 strict mais suffisamment unique en pratique (≥122 bits d'entropie)
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`
}

export default function RaceChrono({ raceSession, teams, session, onFinish, onClose }) {
  const [laps, setLaps]                     = useState([])
  const [motoInput, setMotoInput]           = useState('')
  const [chrono, setChrono]                 = useState(0)
  const [sessionData, setSessionData]       = useState(raceSession)
  const [lastLapFlash, setLastLapFlash]     = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')

  // ── Undo + annonce ──
  const [lastInsertedLapId, setLastInsertedLapId] = useState(null)
  const [undoCountdown, setUndoCountdown]         = useState(0)
  const [announcement, setAnnouncement]           = useState('')
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
  const [announceSent, setAnnounceSent]           = useState(false)
  const [xxlMode, setXxlMode]                     = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  )
  // Compteur affiché de laps en attente de synchronisation (visibilité offline)
  const [pendingCount, setPendingCount] = useState(0)
  // Génération du channel realtime : incrémentée à chaque CLOSED pour forcer
  // la recréation. Garantit la reprise du temps réel sans intervention user.
  const [channelGen, setChannelGen] = useState(0)

  const inputRef         = useRef(null)
  const intervalRef      = useRef(null)
  const undoTimerRef     = useRef(null)
  const extrasChannelRef = useRef(null)

  // ── Queue offline (source de vérité de fiabilité) ──
  // In-memory + miroir localStorage synchrone. Chaque item :
  //   { client_id, session_id, team_id, moto_number, lap_time_ms,
  //     lap_number, recorded_by, recorded_at, status: 'pending'|'syncing' }
  // Pas de statut 'synced' : un item synchronisé est retiré de la queue.
  const queueRef        = useRef([])
  const queueKey        = `race_offline_laps_${raceSession.id}`
  // Mutex anti-syncs concurrents (cause root du bug "lap perdu en cas A,
  // doublon en cas B"). Une seule sync en vol à la fois, on re-pompe à la fin.
  const syncingRef      = useRef(false)
  // Backoff exponentiel sur échec (1s → 2s → 4s → … → 30s)
  const backoffRef      = useRef(0)
  const backoffTimerRef = useRef(null)
  // Anti-double-fire (Enter en key-repeat, double-tap sur ✓ mobile)
  const recordingLockRef = useRef(0)

  const persistQueue = useCallback(() => {
    try {
      localStorage.setItem(queueKey, JSON.stringify(queueRef.current))
    } catch { /* quota plein / mode privé : on s'appuie sur l'in-memory */ }
    setPendingCount(queueRef.current.length)
  }, [queueKey])

  // Hydrate la queue depuis localStorage au mount (récupération après
  // crash navigateur, reboot tablette, kill d'onglet…).
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(queueKey) || '[]')
      // Items qui étaient 'syncing' au moment d'un crash : on les repasse
      // en 'pending'. L'upsert sur client_id est idempotent, donc safe.
      queueRef.current = stored.map(q => ({ ...q, status: 'pending' }))
      setPendingCount(queueRef.current.length)
    } catch { queueRef.current = [] }
  }, [queueKey])

  // categories : memoizé (sinon `|| []` crée un nouveau tableau à chaque render
  // → invalide le memo des rankings → recompute inutile à chaque tick du chrono)
  const categories = useMemo(() => raceSession?.categories || [], [raceSession?.categories])
  const isRunning  = !!sessionData?.started_at && sessionData?.status === 'live'
  const startTime  = sessionData?.started_at ? new Date(sessionData.started_at).getTime() : null

  // Sync prop changes
  useEffect(() => { setSessionData(raceSession) }, [raceSession])

  // Channel "extras" pour broadcaster les annonces
  useEffect(() => {
    const ch = supabase.channel(`live-extras-${raceSession.id}`).subscribe()
    extrasChannelRef.current = ch
    return () => supabase.removeChannel(ch)
  }, [raceSession.id])

  // ── Chargement initial + resync sur erreur channel ──
  // Merge DB + queue locale (les items pending pas encore confirmés en DB
  // sont affichés en optimiste avec id 'local-{client_id}').
  const loadLaps = useCallback(async () => {
    const { data } = await supabase
      .from('race_laps')
      .select('*')
      .eq('session_id', raceSession.id)
      .order('recorded_at', { ascending: false })

    const dbRows = data || []
    const dbClientIds = new Set(dbRows.map(r => r.client_id).filter(Boolean))
    const localOnly = queueRef.current
      .filter(q => !dbClientIds.has(q.client_id))
      .map(q => ({ ...q, id: `local-${q.client_id}` }))
    setLaps([...localOnly, ...dbRows])
  }, [raceSession.id])

  // ── Sync engine (le cœur de la fiabilité) ──
  // Invariants :
  //   - Une seule sync en vol à la fois (mutex syncingRef).
  //   - Upsert idempotent sur client_id : un rejeu = aucun effet.
  //   - error null ⇒ tous les client_ids envoyés sont en DB → retire de queue.
  //   - error non-null ⇒ rollback status 'pending' + backoff exponentiel.
  //   - Les items ajoutés pendant qu'une sync tourne déclenchent un re-pump.
  // Named function expression (`syncOnceFn`) pour pouvoir s'auto-référer
  // dans les setTimeout (backoff retry + re-pump) sans tomber dans le TDZ
  // de la const `syncOnce` capturée par closure.
  const syncOnce = useCallback(async function syncOnceFn() {
    if (syncingRef.current) return
    if (!navigator.onLine) return

    const toSync = queueRef.current.filter(q => q.status === 'pending')
    if (toSync.length === 0) return

    syncingRef.current = true
    toSync.forEach(q => { q.status = 'syncing' })
    persistQueue()

    const payload = toSync.map(q => ({
      client_id:   q.client_id,
      session_id:  q.session_id,
      team_id:     q.team_id,
      moto_number: q.moto_number,
      lap_time_ms: q.lap_time_ms,
      lap_number:  q.lap_number,
      recorded_by: q.recorded_by,
      recorded_at: q.recorded_at,
    }))

    const { data, error } = await supabase
      .from('race_laps')
      .upsert(payload, { onConflict: 'client_id', ignoreDuplicates: true })
      .select()

    if (error) {
      // Rollback → retry plus tard
      toSync.forEach(q => { q.status = 'pending' })
      persistQueue()
      if (error.code === 'PGRST301' || /jwt/i.test(error.message || '')) {
        console.warn('[ChronoSync] JWT expiré — laps conservés en queue, sync au prochain refresh')
      } else {
        console.warn('[ChronoSync] Sync failed:', error.message || error)
      }
      backoffRef.current = Math.min(Math.max(backoffRef.current * 2, 1000), 30000)
      clearTimeout(backoffTimerRef.current)
      backoffTimerRef.current = setTimeout(() => {
        syncingRef.current = false
        syncOnceFn()
      }, backoffRef.current)
      return
    }

    // Succès : tous les client_ids envoyés sont garantis en DB
    const syncedIds = new Set(toSync.map(q => q.client_id))
    queueRef.current = queueRef.current.filter(q => !syncedIds.has(q.client_id))
    persistQueue()
    backoffRef.current = 0

    if (data && data.length > 0) {
      // Patch en place : remplace les optimistes 'local-X' par les vraies lignes DB
      setLaps(prev => {
        const map = new Map(prev.map(l => [l.id, l]))
        for (const row of data) {
          map.delete(`local-${row.client_id}`)
          if (!map.has(row.id)) map.set(row.id, row)
        }
        return Array.from(map.values()).sort((a, b) =>
          new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
        )
      })
    } else {
      // Rejeu idempotent : les lignes étaient déjà en DB. Aucun realtime ne
      // fira pour ces rows. Réconcilie en virant les optimistes correspondants.
      setLaps(prev => prev.filter(l => {
        if (typeof l.id !== 'string' || !l.id.startsWith('local-')) return true
        return !syncedIds.has(l.id.slice(6))
      }))
      // Et on relit la DB pour récupérer les vraies lignes (insérées par
      // un sync antérieur dont on a perdu la trace).
      loadLaps()
    }

    syncingRef.current = false
    if (queueRef.current.some(q => q.status === 'pending')) {
      setTimeout(syncOnceFn, 0)
    }
  }, [persistQueue, loadLaps])

  // Sync sur reconnexion réseau + au mount
  useEffect(() => {
    const onOnline = () => { backoffRef.current = 0; syncOnce() }
    window.addEventListener('online', onOnline)
    if (navigator.onLine) syncOnce()
    return () => window.removeEventListener('online', onOnline)
  }, [syncOnce])

  // ── Realtime : patch en place (jamais de loadLaps complet sauf resync) ──
  useEffect(() => {
    loadLaps()

    const channel = supabase.channel(`race_laps_chrono_${raceSession.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_laps', filter: `session_id=eq.${raceSession.id}` }, ({ new: row }) => {
        setLaps(prev => {
          if (prev.some(l => l.id === row.id)) return prev
          // Remplace l'optimiste local-{client_id} par la vraie ligne
          if (row.client_id) {
            const localKey = `local-${row.client_id}`
            const idx = prev.findIndex(l => l.id === localKey)
            if (idx >= 0) {
              const next = prev.slice()
              next[idx] = row
              return next
            }
          }
          return [row, ...prev]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_laps', filter: `session_id=eq.${raceSession.id}` }, ({ new: row }) => {
        setLaps(prev => prev.map(l => l.id === row.id ? row : l))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'race_laps', filter: `session_id=eq.${raceSession.id}` }, ({ old: row }) => {
        setLaps(prev => prev.filter(l => l.id !== row.id))
      })
      .subscribe((status) => {
        // Socket mort → on resync ET on force la recréation du channel.
        // Sans recréation, supabase-js peut rester CLOSED indéfiniment
        // (le socket se reconnecte mais ne re-join pas le channel),
        // forçant l'admin à rafraîchir pour récupérer du temps réel.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[ChronoSync] Channel', status, '→ resync + recréation')
          loadLaps()
          setTimeout(() => setChannelGen(g => g + 1), 2000)
        }
      })

    const sessionChannel = supabase.channel(`race_session_sync_${raceSession.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${raceSession.id}` }, (payload) => {
        if (payload.new) setSessionData(payload.new)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(sessionChannel)
    }
  }, [raceSession.id, loadLaps, channelGen])

  // ── Fallback polling inconditionnel (5s) ──
  // Tourne en permanence pour compenser les configurations Supabase / RLS
  // qui bloquent la propagation Realtime.
  useEffect(() => {
    if (!raceSession?.id) return
    const sid = raceSession.id
    const tick = () => {
      // Refresh session
      supabase.from('race_sessions').select('*').eq('id', sid).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setSessionData(prev => {
              if (JSON.stringify(prev) === JSON.stringify(data)) return prev
              return data
            })
          }
        })
      // Refresh laps
      supabase.from('race_laps').select('*').eq('session_id', sid).order('recorded_at', { ascending: false })
        .then(({ data }) => {
          if (!data) return
          setLaps(prev => {
            const dbRows = data || []
            const dbClientIds = new Set(dbRows.map(r => r.client_id).filter(Boolean))
            const localOnly = queueRef.current
              .filter(q => !dbClientIds.has(q.client_id))
              .map(q => ({ ...q, id: `local-${q.client_id}` }))
            const nextLaps = [...localOnly, ...dbRows]
            if (prev.length !== nextLaps.length) return nextLaps
            const prevIds = new Set(prev.map(l => l.id))
            for (const l of nextLaps) {
              if (!prevIds.has(l.id)) return nextLaps
            }
            return prev
          })
        })
    }
    const interval = setInterval(tick, 5000)
    return () => clearInterval(interval)
  }, [raceSession.id])

  // ── Chrono timer ──
  // 100ms suffit pour un affichage MM:SS/HH:MM:SS fluide. Le lap_time_ms
  // saisi est recalculé en EXACT (Date.now() - startTime) au moment du
  // record, donc indépendant du tick d'affichage.
  useEffect(() => {
    if (isRunning && startTime) {
      setChrono(Date.now() - startTime)
      intervalRef.current = setInterval(() => {
        setChrono(Date.now() - startTime)
      }, 100)
    } else {
      clearInterval(intervalRef.current)
      if (sessionData?.started_at && sessionData?.finished_at) {
        setChrono(new Date(sessionData.finished_at).getTime() - new Date(sessionData.started_at).getTime())
      } else {
        setChrono(0)
      }
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning, startTime, sessionData?.started_at, sessionData?.finished_at])

  // Auto-focus de l'input au mount uniquement (avant : à chaque update de
  // laps, ce qui volait le focus de l'input d'annonce quand un lap arrivait).
  useEffect(() => {
    if (!xxlMode && inputRef.current) inputRef.current.focus()
  }, [xxlMode])

  // Cleanup timers
  useEffect(() => () => {
    clearInterval(undoTimerRef.current)
    clearTimeout(backoffTimerRef.current)
  }, [])

  // Verrouille le scroll du body quand le mode XXL est actif
  useEffect(() => {
    if (!xxlMode) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [xxlMode])



  const handleStartChrono = async () => {
    const nowStr = new Date().toISOString()
    setSessionData(prev => ({ ...prev, started_at: nowStr }))
    const { error } = await supabase
      .from('race_sessions')
      .update({ started_at: nowStr })
      .eq('id', raceSession.id)
    if (error) alert('Erreur de synchronisation du chrono: ' + error.message)
  }

  const handleResetChrono = async () => {
    if (!confirm('⏹ Réinitialiser le chronomètre à 0 ?')) return
    setSessionData(prev => ({ ...prev, started_at: null }))
    const { error } = await supabase
      .from('race_sessions')
      .update({ started_at: null })
      .eq('id', raceSession.id)
    if (error) alert('Erreur de réinitialisation du chrono: ' + error.message)
  }

  const handleAddPenalty = async () => {
    const num = parseInt(motoInput)
    if (!num) return
    const team = teams.find(t => t.moto_number === num)
    if (!team) {
      alert(`Moto #${num} non trouvée !`)
      return
    }
    if (!confirm(`⚠️ Confirmer la PÉNALITÉ (-1 Tour) pour la moto #${num} ?`)) return

    const { error } = await supabase.from('race_teams')
      .update({ penalty_laps: (team.penalty_laps || 0) + 1 })
      .eq('id', team.id)
    if (error) {
      alert('Erreur lors de la pénalité: ' + error.message)
    } else {
      setMotoInput('')
      setLastLapFlash({ moto: num, time: 0, pilot: `PÉNALITÉ APPLIQUÉE (-1 Tour)` })
      setTimeout(() => setLastLapFlash(null), 3000)
    }
  }

  const handleRecordLap = useCallback((overrideMoto) => {
    // Anti-double-fire (Enter key-repeat / double-tap mobile)
    if (Date.now() < recordingLockRef.current) return
    recordingLockRef.current = Date.now() + 150

    const num = parseInt(overrideMoto ?? motoInput)
    if (!num || !isRunning || !startTime) return

    const team = teams.find(t => t.moto_number === num)
    if (!team) {
      alert(`Moto #${num} non trouvée dans la liste des équipes !`)
      return
    }

    // ⚠ lap_time_ms calculé en EXACT au moment du record, indépendamment
    // du tick d'affichage (qui peut avoir jusqu'à 100ms de retard).
    const lapTime = Date.now() - startTime
    const teamLaps = laps.filter(l => l.team_id === team.id)
    const lapNumber = teamLaps.length + 1

    const clientId = genClientId()
    const lapData = {
      client_id:   clientId,
      session_id:  raceSession.id,
      team_id:     team.id,
      moto_number: num,
      lap_time_ms: lapTime,
      lap_number:  lapNumber,
      recorded_by: session.user.id,
      recorded_at: new Date().toISOString(),
      status:      'pending',
    }

    // 1. Enqueue (in-memory + localStorage synchrone)
    queueRef.current = [...queueRef.current, lapData]
    persistQueue()

    // 2. Optimistic UI
    setLaps(prev => [{ ...lapData, id: `local-${clientId}` }, ...prev])

    // 3. Undo (10s)
    setLastInsertedLapId(lapData)
    setUndoCountdown(10)
    clearInterval(undoTimerRef.current)
    undoTimerRef.current = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          clearInterval(undoTimerRef.current)
          setLastInsertedLapId(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // 4. Flash visuel
    setLastLapFlash({ moto: num, time: lapTime, pilot: team.pilot_1_name })
    setTimeout(() => setLastLapFlash(null), 3000)

    // 5. Reset input + refocus (uniquement ici, pas sur chaque maj laps)
    setMotoInput('')
    if (!xxlMode && inputRef.current) inputRef.current.focus()

    // 6. Pompe la sync (mutex-safe)
    syncOnce()
  }, [motoInput, isRunning, startTime, teams, laps, raceSession.id, session.user.id, xxlMode, syncOnce, persistQueue])

  const handleUndoLastLap = async () => {
    if (!lastInsertedLapId) return
    clearInterval(undoTimerRef.current)

    const clientId = lastInsertedLapId.client_id

    // Cas 1 : encore en queue (pas encore en DB) → on retire de la queue
    const inQueue = queueRef.current.some(q => q.client_id === clientId)
    if (inQueue) {
      queueRef.current = queueRef.current.filter(q => q.client_id !== clientId)
      persistQueue()
      setLaps(prev => prev.filter(l => l.id !== `local-${clientId}`))
    } else if (navigator.onLine) {
      // Cas 2 : déjà en DB → DELETE par client_id (plus fiable que recorded_at)
      const { error } = await supabase.from('race_laps').delete().eq('client_id', clientId)
      if (error) {
        alert('Impossible de supprimer ce passage : ' + error.message)
        return
      }
      // Le realtime DELETE patchera le state
    } else {
      alert('Hors-ligne : impossible d\'annuler un passage déjà synchronisé.')
      return
    }

    setLastInsertedLapId(null)
    setUndoCountdown(0)
    setLastLapFlash(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRecordLap() }
  }

  const handleDeleteLap = async (lapId) => {
    if (!confirm('Supprimer ce passage ?')) return
    // Local optimiste : juste retirer de la queue + state
    if (typeof lapId === 'string' && lapId.startsWith('local-')) {
      const clientId = lapId.slice(6)
      queueRef.current = queueRef.current.filter(q => q.client_id !== clientId)
      persistQueue()
      setLaps(prev => prev.filter(l => l.id !== lapId))
      return
    }
    await supabase.from('race_laps').delete().eq('id', lapId)
    // Realtime DELETE patchera l'UI
  }

  const handleFinishRace = async () => {
    if (!confirm('🏁 Terminer la course ? Les chronos ne pourront plus être saisis.')) return
    try {
      const { data, error } = await supabase.from('race_sessions').update({
        status: 'finished',
        finished_at: new Date().toISOString()
      }).eq('id', raceSession.id).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("La session n'a pas pu être mise à jour.")
      if (onFinish) onFinish()
    } catch (err) {
      alert('Erreur lors du changement de statut : ' + err.message)
    }
  }

  // ── Announcement to spectators ──
  const handleSendAnnouncement = async () => {
    const text = announcement.trim()
    if (!text) return
    setSendingAnnouncement(true)
    try {
      const { error } = await supabase.from('race_announcements').insert([
        { session_id: raceSession.id, message: text }
      ])
      if (error) console.error('Erreur sauvegarde annonce:', error)

      await extrasChannelRef.current?.send({
        type: 'broadcast',
        event: 'announcement',
        payload: { text }
      })
      setAnnouncement('')
      setAnnounceSent(true)
      setTimeout(() => setAnnounceSent(false), 3000)
    } finally {
      setSendingAnnouncement(false)
    }
  }


  // ── XXL Numpad ──
  const handleNumpadKey = (key) => {
    if (key === '⌫') {
      setMotoInput(prev => prev.slice(0, -1))
    } else if (key === '✓') {
      handleRecordLap(motoInput || undefined)
    } else {
      setMotoInput(prev => (prev + key).slice(0, 4))
    }
  }

  // ── Classement (memoizé : ne recompile QUE quand laps/teams/cat changent,
  //    pas à chaque tick du chrono).
  const rankings = useMemo(() => {
    const out = {}
    const catFilter = selectedCategory === 'all' ? categories : [selectedCategory]
    catFilter.forEach(cat => {
      const catTeams = teams.filter(t => t.category === cat)
      const teamResults = catTeams.map(team => {
        const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
        const actualLapsCount = teamLaps.length
        const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
        let bestLap = null
        if (actualLapsCount > 0) {
          // reduce manuel (safe pour 10k+ items, vs Math.min(...arr) qui peut stack-overflow)
          let bl = teamLaps[0].lap_time_ms
          for (let i = 1; i < actualLapsCount; i++) {
            const dur = teamLaps[i].lap_time_ms - teamLaps[i - 1].lap_time_ms
            if (dur < bl) bl = dur
          }
          bestLap = bl
        }
        return {
          ...team, bestLap, totalLaps, laps: teamLaps,
          lastPassageTime: actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
        }
      }).filter(t => t.totalLaps > 0)
        .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)
      if (teamResults.length > 0) out[cat] = teamResults
    })
    return out
  }, [laps, teams, categories, selectedCategory])

  const previewTeam = motoInput ? teams.find(t => t.moto_number === parseInt(motoInput)) : null

  // Temps restant (si une durée est définie sur la session)
  const durationMs = sessionData?.duration_minutes != null ? sessionData.duration_minutes * 60 * 1000 : null
  const remainingMs = durationMs != null ? durationMs - chrono : null
  const isOvertime = remainingMs != null && remainingMs < 0
  const isCritical = remainingMs != null && remainingMs >= 0 && remainingMs <= 60_000

  // ── XXL Numpad Overlay ──
  // Portal sur document.body : un ancêtre (.section avec animation pageEnter
  // qui laisse un transform résiduel) crée un containing block et casserait
  // le position:fixed → l'overlay XXL apparaîtrait en plein milieu de la page
  // au lieu de couvrir le viewport. Sur mobile, c'est invivable : la moitié
  // du clavier dépasse, on voit le footer/navbar autour.
  if (xxlMode) {
    return createPortal(
      <div className="chrono-xxl-overlay">
        <div className="chrono-xxl-header">
          <button className="btn btn-ghost chrono-xxl-close" onClick={() => setXxlMode(false)}>✕ Normal</button>
          <div className="chrono-xxl-timer-wrap">
            <div className="chrono-xxl-timer">{formatTime(chrono, false)}</div>
            {durationMs != null && (
              <div className={`chrono-xxl-remaining${isOvertime ? ' is-overtime' : ''}${isCritical ? ' is-critical' : ''}`}>
                {isOvertime
                  ? `⏰ +${formatTime(Math.abs(remainingMs), false)} dépassement`
                  : `⏳ ${formatTime(remainingMs, false)} restant`}
              </div>
            )}
          </div>
          <div className="chrono-xxl-badge">
            {isRunning ? <><span className="chrono-live-dot" />EN DIRECT</> : '⏸ EN ATTENTE'}
            {pendingCount > 0 && <span style={{ marginLeft: 8, fontSize: '0.85em', opacity: 0.85 }}>📡 {pendingCount}</span>}
          </div>
        </div>

        {/* Display */}
        <div className="chrono-xxl-display">
          <div className="chrono-xxl-input">{motoInput || '#'}</div>
          {previewTeam && (
            <div className="chrono-xxl-preview">
              <span className="chrono-xxl-cat">{previewTeam.category}</span>
              <span className="chrono-xxl-pilot">{previewTeam.pilot_1_name}{previewTeam.pilot_2_name ? ` & ${previewTeam.pilot_2_name}` : ''}</span>
            </div>
          )}
          {motoInput && !previewTeam && (
            <div className="chrono-xxl-notfound">Moto #{motoInput} introuvable</div>
          )}
        </div>

        {/* Last flash */}
        {lastLapFlash && (
          <div className="chrono-xxl-flash">
            ✅ #{lastLapFlash.moto} — {lastLapFlash.pilot} — {formatTime(lastLapFlash.time)}
          </div>
        )}

        {/* Undo */}
        {lastInsertedLapId && undoCountdown > 0 && (
          <button className="chrono-xxl-undo" onClick={handleUndoLastLap}>
            ↩ ANNULER ({undoCountdown}s)
          </button>
        )}

        {/* Numpad */}
        <div className="chrono-xxl-numpad">
          {NUMPAD_KEYS.map((row, ri) => (
            <div key={ri} className="chrono-xxl-row">
              {row.map(key => (
                <button
                  key={key}
                  className={`chrono-xxl-key${key === '✓' ? ' key-confirm' : ''}${key === '⌫' ? ' key-del' : ''}`}
                  onClick={() => handleNumpadKey(key)}
                  disabled={key === '✓' && (!isRunning || !previewTeam)}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="chrono-container">
      {/* ─── Top Bar ─── */}
      <div className="chrono-top-bar">
        <div className="chrono-top-left">
          <button className="btn btn-ghost" onClick={onClose}>← Retour</button>
          <div className="chrono-live-badge">
            <span className="chrono-live-dot" />
            EN DIRECT
          </div>
          {pendingCount > 0 && (
            <div className="chrono-live-badge" style={{ background: 'rgba(255,140,0,0.15)', borderColor: 'rgba(255,140,0,0.4)' }} title="Passages en attente de synchronisation">
              📡 {pendingCount} en attente
            </div>
          )}
        </div>
        <h2 className="chrono-title">{raceSession.name}</h2>
        <div className="chrono-top-right">
          <button
            className="btn btn-ghost chrono-xxl-toggle"
            onClick={() => setXxlMode(true)}
            title="Mode pavé numérique XXL (trackside)"
          >
            ⌨️ XXL
          </button>
          <button className="btn btn-outline chrono-finish-btn" onClick={handleFinishRace}>
            🏁 Terminer
          </button>
        </div>
      </div>

      <div className="chrono-layout">
        {/* ─── Left: Chrono + Input ─── */}
        <div className="chrono-panel-left">
          {/* Big Chrono Display */}
          <div className="chrono-display glass">
            <div className="chrono-time">{formatTime(chrono, false)}</div>
            {durationMs != null && (
              <div className={`chrono-remaining${isOvertime ? ' is-overtime' : ''}${isCritical ? ' is-critical' : ''}`}>
                {isOvertime
                  ? `⏰ +${formatTime(Math.abs(remainingMs), false)} de dépassement`
                  : `⏳ ${formatTime(remainingMs, false)} restant`}
              </div>
            )}
            <div className="chrono-controls">
              {!isRunning ? (
                <button className="chrono-btn chrono-btn-start" onClick={handleStartChrono}>
                  ▶ DÉMARRER
                </button>
              ) : (
                <button className="chrono-btn chrono-btn-reset" onClick={handleResetChrono}>
                  ⏹ RESET
                </button>
              )}
            </div>
          </div>

          {/* Moto Input */}
          <div className="chrono-input-area glass">
            <label className="chrono-input-label">N° MOTO</label>
            <div className="chrono-input-row">
              <input
                ref={inputRef}
                type="number"
                className="chrono-moto-input"
                value={motoInput}
                onChange={e => setMotoInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="#"
                disabled={!isRunning}
                min="1"
              />
              <button
                className="btn btn-primary chrono-record-btn"
                onClick={() => handleRecordLap()}
                disabled={!isRunning || !motoInput}
              >
                ⏱️ ENREGISTRER
              </button>
              <button
                className="btn btn-error chrono-penalty-btn"
                onClick={() => handleAddPenalty()}
                disabled={!motoInput}
                style={{ marginLeft: '10px' }}
                title="Ajouter une pénalité (-1 Tour)"
              >
                ⚠️ PÉNALITÉ
              </button>
            </div>
            {motoInput && previewTeam && (
              <div className="chrono-moto-preview">
                {previewTeam.category} — {previewTeam.pilot_1_name}
              </div>
            )}
            {motoInput && !previewTeam && (
              <div className="chrono-moto-preview chrono-moto-unknown">
                ⚠️ Moto #{motoInput} introuvable
              </div>
            )}
          </div>

          {/* Undo last lap */}
          {lastInsertedLapId && undoCountdown > 0 && (
            <button className="chrono-undo-btn glass" onClick={handleUndoLastLap}>
              ↩ Annuler dernier passage ({undoCountdown}s)
            </button>
          )}

          {/* Last Lap Flash */}
          {lastLapFlash && (
            <div className="chrono-flash glass">
              <span className="chrono-flash-moto">#{lastLapFlash.moto}</span>
              <span className="chrono-flash-time">{formatTime(lastLapFlash.time)}</span>
              <span className="chrono-flash-pilot">{lastLapFlash.pilot}</span>
            </div>
          )}

          {/* Announcement panel */}
          <div className="chrono-announce-panel glass">
            <h3 className="chrono-announce-title">📢 Annonce aux Spectateurs</h3>
            <div className="chrono-announce-row">
              <input
                type="text"
                className="chrono-announce-input"
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendAnnouncement() }}
                placeholder="Message pour les spectateurs..."
                maxLength={200}
              />
              <button
                className={`btn chrono-announce-btn ${announceSent ? 'btn-ghost' : 'btn-primary'}`}
                onClick={handleSendAnnouncement}
                disabled={sendingAnnouncement || !announcement.trim()}
              >
                {announceSent ? '✅ Envoyée !' : '📤 Envoyer'}
              </button>
            </div>
          </div>

          {/* Recent Laps */}
          <div className="chrono-recent glass">
            <h3>⏱️ Derniers Passages ({laps.length})</h3>
            <div className="chrono-recent-list">
              {laps.slice(0, 15).map(l => {
                const team = teams.find(t => t.id === l.team_id)
                const isLocal = typeof l.id === 'string' && l.id.startsWith('local-')
                return (
                  <div key={l.id} className="chrono-recent-item" style={isLocal ? { opacity: 0.75 } : undefined} title={isLocal ? 'En attente de synchronisation' : undefined}>
                    <span className="chrono-recent-moto">#{l.moto_number}</span>
                    <span className="chrono-recent-name">{team?.pilot_1_name || '?'}{isLocal ? ' 📡' : ''}</span>
                    <span className="chrono-recent-time">{formatTime(l.lap_time_ms)}</span>
                    <button className="chrono-recent-delete" onClick={() => handleDeleteLap(l.id)}>✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ─── Right: Live Rankings + DNF/DNS ─── */}
        <div className="chrono-panel-right">
          <div className="chrono-rankings glass">
            <div className="chrono-rankings-header">
              <h3>🏆 Classement Live</h3>
              <select
                className="chrono-cat-filter"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="all">Toutes catégories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {Object.keys(rankings).length === 0 ? (
              <div className="chrono-rankings-empty">En attente des premiers passages...</div>
            ) : (
              Object.entries(rankings).map(([cat, results]) => (
                <div key={cat} className="chrono-cat-section">
                  <h4 className="chrono-cat-title">{cat}</h4>
                  <table className="chrono-rankings-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>N°</th>
                        <th>Pilote</th>
                        <th>Meilleur</th>
                        <th>Tours</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={r.id} className={`${i < 3 ? `chrono-podium-${i + 1}` : ''}`}>
                          <td className="chrono-pos">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </td>
                          <td className="chrono-num">#{r.moto_number}</td>
                          <td className="chrono-pilot">{r.pilot_1_name}</td>
                          <td className="chrono-best">{formatTime(r.bestLap)}</td>
                          <td className="chrono-laps-count">{r.totalLaps}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
