import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LiveTeamDrawer from './LiveTeamDrawer'
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

  const elapsedRef          = useRef(null)
  const prevRankingsRef     = useRef({})
  const extrasChannelRef    = useRef(null)

  // ── Video stream ──
  useEffect(() => {
    if (!session?.live_stream_active) { setStreamFrame(null); return }
    const ch = supabase.channel(`live-stream-${session.id}`)
      .on('broadcast', { event: 'video-frame' }, ({ payload }) => {
        if (payload?.image) setStreamFrame(payload.image)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [session])

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
  useEffect(() => { loadLiveSession() }, [customSessionId])

  const loadLiveSession = async () => {
    setLoading(true)
    let sessions = []
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
    }
    setLoading(false)
  }

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
  }, [laps, getRankingsForAll])

  // ── Helpers ──
  const addFloatingEmoji = (emoji) => {
    const id = Date.now() + Math.random()
    const x = 5 + Math.random() * 88
    setFloatingEmojis(prev => [...prev, { id, emoji, x }])
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 3200)
  }

  const sendReaction = (emoji) => {
    addFloatingEmoji(emoji)
    extrasChannelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
  }

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
        {session.live_stream_active && (
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

        {/* ── Category tabs ── */}
        <div className="live-cat-tabs">
          {['all', ...categories].map(c => (
            <button key={c} className={`live-cat-tab ${selectedCategory === c ? 'active' : ''}`} onClick={() => setSelectedCategory(c)}>
              {c === 'all' ? 'Toutes' : c}
            </button>
          ))}
        </div>

        <div className="live-content-grid">
          {/* ── Rankings table ── */}
          <div className="live-rankings-panel">
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

            {/* ── Podiums per category (finished) ── */}
            {isFinished && (
              <div className="live-podiums-section">
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
          </div>

          {/* ── Sidebar ── */}
          <div className="live-sidebar">
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
                <h3 className="live-reactions-title">💬 Réagir</h3>
                <div className="live-reactions-grid">
                  {EMOJIS.map(emoji => (
                    <button key={emoji} className="live-reaction-btn" onClick={() => sendReaction(emoji)} aria-label={`Réaction ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
    </section>
  )
}
