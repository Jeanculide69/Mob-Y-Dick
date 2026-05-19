import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import './LiveRace.css'

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export default function LiveRace({ customSessionId, onClose }) {
  const [session, setSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [laps, setLaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [highlightedLap, setHighlightedLap] = useState(null)
  const [eventInfo, setEventInfo] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(null)

  // Spectator Realtime Video Stream State
  const [streamFrame, setStreamFrame] = useState(null)
  useEffect(() => {
    if (!session || !session.live_stream_active) {
      setStreamFrame(null)
      return
    }

    const channel = supabase.channel(`live-stream-${session.id}`)
      .on('broadcast', { event: 'video-frame' }, (payload) => {
        if (payload.payload && payload.payload.image) {
          setStreamFrame(payload.payload.image)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  // Live race standings and laps realtime subscriptions
  useEffect(() => {
    if (!session?.id) return

    const channel = supabase.channel(`live_race_public_${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_laps', filter: `session_id=eq.${session.id}` }, (payload) => {
        setLaps(prev => [payload.new, ...prev])
        setHighlightedLap(payload.new.id)
        setTimeout(() => setHighlightedLap(null), 4000)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.id])

  useEffect(() => {
    loadLiveSession()
  }, [customSessionId])

  // Elapsed time counter
  useEffect(() => {
    if (session?.started_at && session?.status === 'live') {
      elapsedRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(session.started_at).getTime())
      }, 1000)
    }
    return () => clearInterval(elapsedRef.current)
  }, [session])

  const loadLiveSession = async () => {
    setLoading(true)
    let sessions = []
    
    if (customSessionId) {
      const { data } = await supabase
        .from('race_sessions')
        .select('*')
        .eq('id', customSessionId)
        .limit(1)
      sessions = data || []
    } else {
      // Find any live or recently finished session
      const { data } = await supabase
        .from('race_sessions')
        .select('*')
        .in('status', ['live', 'finished', 'published'])
        .order('created_at', { ascending: false })
        .limit(1)
      sessions = data || []
    }

    if (sessions && sessions.length > 0) {
      const s = sessions[0]
      setSession(s)

      // Load event info
      const { data: ev } = await supabase.from('events').select('*').eq('id', s.event_id).single()
      setEventInfo(ev)

      // Load teams
      const { data: teamsData } = await supabase
        .from('race_teams')
        .select('*')
        .eq('session_id', s.id)
        .order('moto_number')
      setTeams(teamsData || [])

      // Load laps
      const { data: lapsData } = await supabase
        .from('race_laps')
        .select('*')
        .eq('session_id', s.id)
        .order('recorded_at', { ascending: false })
      setLaps(lapsData || [])

    }
    setLoading(false)
  }

  if (loading && !session) return (
    <section className="section page-top">
      <div className="container">
        <div className="live-loading">
          <div className="live-loading-spinner" />
          <p>Recherche d'une course en direct...</p>
        </div>
      </div>
    </section>
  )

  if (!session) return (
    <section className="section page-top">
      <div className="container">
        <div className="live-no-race">
          <span className="live-no-race-icon">🏁</span>
          <h2>Aucune course en cours</h2>
          <p>Revenez lors du prochain événement pour suivre la course en direct !</p>
        </div>
      </div>
    </section>
  )

  const categories = session.categories || []
  const isLive = session.status === 'live'
  const isFinished = session.status === 'finished' || session.status === 'published'

  // Build rankings
  const getRankings = (cat) => {
    const catTeams = cat === 'all' ? teams : teams.filter(t => t.category === cat)
    const sorted = catTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const totalLaps = teamLaps.length
      
      let bestLap = null
      let lastLap = null
      let avgLap = null
      
      if (totalLaps > 0) {
        const durations = teamLaps.map((lap, idx) => {
          if (idx === 0) return lap.lap_time_ms
          return lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
        })
        bestLap = Math.min(...durations)
        lastLap = durations[totalLaps - 1]
        avgLap = Math.round(teamLaps[totalLaps - 1].lap_time_ms / totalLaps)
      }

      return { 
        ...team, 
        bestLap, 
        avgLap, 
        lastLap, 
        totalLaps, 
        laps: teamLaps,
        lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity
      }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => {
        // 1. More laps completed = ahead
        if (b.totalLaps !== a.totalLaps) {
          return b.totalLaps - a.totalLaps
        }
        // 2. Same laps, whoever got there first = ahead
        return a.lastPassageTime - b.lastPassageTime
      })

    // Map over sorted to calculate F1 gaps and intervals
    return sorted.map((r, index) => {
      if (index === 0) {
        return { ...r, gapToLeader: 'LEADER', interval: '-' }
      }
      const leader = sorted[0]
      const prev = sorted[index - 1]
      
      let gapToLeader = ''
      if (r.totalLaps === leader.totalLaps) {
        gapToLeader = `+${((r.lastPassageTime - leader.lastPassageTime) / 1000).toFixed(3)}s`
      } else {
        const lapsDown = leader.totalLaps - r.totalLaps
        gapToLeader = `+${lapsDown} ${lapsDown === 1 ? 'Tour' : 'Tours'}`
      }

      let interval = ''
      if (r.totalLaps === prev.totalLaps) {
        interval = `+${((r.lastPassageTime - prev.lastPassageTime) / 1000).toFixed(3)}s`
      } else {
        const lapsDown = prev.totalLaps - r.totalLaps
        interval = `+${lapsDown} ${lapsDown === 1 ? 'Tour' : 'Tours'}`
      }

      return { ...r, gapToLeader, interval }
    })
  }

  const getFemaleWinner = () => {
    const femaleTeams = teams.filter(t => 
      t.pilot_1_sex === 'F' || 
      t.pilot_2_sex === 'F' || 
      t.pilot_3_sex === 'F'
    )
    if (femaleTeams.length === 0) return null

    const rankedFemale = femaleTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const totalLaps = teamLaps.length
      
      let bestLap = null
      if (totalLaps > 0) {
        const durations = teamLaps.map((lap, idx) => {
          if (idx === 0) return lap.lap_time_ms
          return lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
        })
        bestLap = Math.min(...durations)
      }

      return {
        ...team,
        totalLaps,
        bestLap,
        lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity
      }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => {
        if (b.totalLaps !== a.totalLaps) {
          return b.totalLaps - a.totalLaps
        }
        return a.lastPassageTime - b.lastPassageTime
      })

    return rankedFemale[0] || null
  }

  const allRankings = getRankings(selectedCategory)
  const recentLaps = laps.slice(0, 8)

  // Stats
  const totalLaps = laps.length
  const totalTeams = new Set(laps.map(l => l.team_id)).size
  const bestOverall = laps.length > 0 ? Math.min(...laps.map(l => l.lap_time_ms)) : null
  const bestTeam = bestOverall ? teams.find(t => t.id === laps.find(l => l.lap_time_ms === bestOverall)?.team_id) : null

  const formatElapsed = (ms) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  }



  return (
    <section className="section page-top live-section">
      <div className="container">
        {onClose && (
          <button 
            className="btn btn-ghost" 
            onClick={onClose}
            style={{ marginBottom: '15px', color: 'var(--accent)', fontWeight: 'bold' }}
          >
            ← Retour aux Événements
          </button>
        )}
        
        {/* ─── Hero Banner ─── */}
        <div className="live-hero glass">
          <div className="live-hero-bg" />
          <div className="live-hero-content">
            <div className="live-hero-left">
              {isLive && (
                <div className="live-badge-big">
                  <span className="live-dot-big" />
                  LIVE
                </div>
              )}
              {isFinished && (
                <div className="live-badge-finished">
                  🏁 {session.status === 'published' ? 'RÉSULTATS OFFICIELS' : 'COURSE TERMINÉE'}
                </div>
              )}
              <h1 className="live-hero-title">{session.name}</h1>
              {eventInfo && (
                <p className="live-hero-event">
                  📍 {eventInfo.location} — {new Date(eventInfo.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
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
            </div>
          </div>
        </div>

        {/* ─── Best Overall ─── */}
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

        {/* ─── Gagnante Féminine Overall ─── */}
        {(() => {
          const femaleWinner = getFemaleWinner()
          if (!femaleWinner) return null
          const femaleNames = []
          if (femaleWinner.pilot_1_sex === 'F') femaleNames.push(femaleWinner.pilot_1_name)
          if (femaleWinner.pilot_2_sex === 'F') femaleNames.push(femaleWinner.pilot_2_name)
          if (femaleWinner.pilot_3_sex === 'F') femaleNames.push(femaleWinner.pilot_3_name)

          return (
            <div className="live-best-overall glass" style={{ border: '1px solid rgba(255, 0, 128, 0.3)', background: 'linear-gradient(90deg, rgba(255, 0, 128, 0.08), rgba(0, 0, 0, 0.2))', marginTop: '10px' }}>
              <span className="live-best-label" style={{ color: '#ff3399' }}>👑 Gagnante Féminine Toute Catégorie</span>
              <div className="live-best-info">
                <span className="live-best-moto" style={{ color: '#ff3399' }}>#{femaleWinner.moto_number}</span>
                <span className="live-best-pilot">{femaleNames.join(' & ')}</span>
                <span className="live-best-time" style={{ color: '#ff3399', textShadow: '0 0 10px rgba(255, 0, 128, 0.3)' }}>{femaleWinner.totalLaps} Tours</span>
                <span className="live-best-cat">Min: {formatTime(femaleWinner.bestLap)}</span>
              </div>
            </div>
          )
        })()}

        {/* ─── Live Video Broadcast Container ─── */}
        {session.live_stream_active && (
          <div className="live-video-container glass" style={{ marginBottom: '30px', padding: '20px', borderRadius: '16px', border: '1px solid var(--accent)', background: 'rgba(255, 85, 0, 0.03)', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ff3b30', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', fontWeight: 'bold' }}>🎥 EN DIRECT DE LA PISTE</h3>
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: '960px', margin: '0 auto', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
              {streamFrame ? (
                <img
                  src={streamFrame}
                  alt="Live video stream"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }}
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                  <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Connexion au flux vidéo de l'organisateur...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Category Filter ─── */}
        <div className="live-cat-tabs">
          <button 
            className={`live-cat-tab ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Toutes
          </button>
          {categories.map(c => (
            <button 
              key={c}
              className={`live-cat-tab ${selectedCategory === c ? 'active' : ''}`}
              onClick={() => setSelectedCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="live-content-grid">
          {/* ─── Main Rankings Table ─── */}
          <div className="live-rankings-panel">
            <div className="live-rankings-card glass">
              <h2 className="live-rankings-title">🏆 Classement {selectedCategory !== 'all' ? `— ${selectedCategory}` : 'Général'}</h2>
              
              {allRankings.length === 0 ? (
                <div className="live-rankings-empty">
                  <p>En attente des premiers passages...</p>
                </div>
              ) : (
                <table className="live-table">
                  <thead>
                    <tr>
                      <th className="live-th-pos">POS</th>
                      <th className="live-th-num">N°</th>
                      <th>PILOTE</th>
                      <th>CATÉGORIE</th>
                      <th className="live-th-time">MEILLEUR</th>
                      <th className="live-th-time">ÉCART 1ER</th>
                      <th className="live-th-time">INTERVALLE</th>
                      <th className="live-th-time">DERNIER</th>
                      <th className="live-th-time">MOYEN</th>
                      <th>TOURS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRankings.map((r, i) => (
                      <tr key={r.id} className={`live-row ${i < 3 ? `live-podium-${i + 1}` : ''}`}>
                        <td className="live-pos">
                          {i === 0 && <span className="live-medal gold">1</span>}
                          {i === 1 && <span className="live-medal silver">2</span>}
                          {i === 2 && <span className="live-medal bronze">3</span>}
                          {i > 2 && <span className="live-pos-num">{i + 1}</span>}
                        </td>
                        <td className="live-num">
                          <span className="live-num-badge">#{r.moto_number}</span>
                        </td>
                        <td className="live-pilot-cell">
                          <span className="live-pilot-name">{r.pilot_1_name}</span>
                          {r.pilot_2_name && <span className="live-pilot-extra">{r.pilot_2_name}</span>}
                        </td>
                        <td className="live-cat-cell">
                          <span className="live-cat-badge">{r.category}</span>
                        </td>
                        <td className="live-time live-time-best">{formatTime(r.bestLap)}</td>
                        <td className="live-time" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: i === 0 ? 'bold' : 'normal' }}>
                          {r.gapToLeader}
                        </td>
                        <td className="live-time" style={{ color: 'var(--text-muted)' }}>
                          {r.interval}
                        </td>
                        <td className="live-time">{formatTime(r.lastLap)}</td>
                        <td className="live-time live-time-avg">{formatTime(r.avgLap)}</td>
                        <td className="live-laps">{r.totalLaps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ─── Podiums per Category (when finished) ─── */}
            {isFinished && (
              <div className="live-podiums-section">
                <h2 className="live-podiums-title">🏆 Podiums {selectedCategory !== 'all' ? `— ${selectedCategory}` : 'par Catégorie'}</h2>
                <div className="live-podiums-grid">
                  {selectedCategory === 'all' ? (
                    categories.map(cat => {
                      const catRankings = getRankings(cat)
                      if (catRankings.length === 0) return null
                      return (
                        <div key={cat} className="live-podium-card glass">
                          <h3 className="live-podium-cat">{cat}</h3>
                          <div className="live-podium-visual">
                            {/* 2nd place */}
                            {catRankings[1] && (
                              <div className="live-podium-step step-2">
                                <div className="live-podium-avatar">🥈</div>
                                <span className="live-podium-name">{catRankings[1].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[1].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[1].bestLap)}</span>
                                <div className="live-podium-block silver">2</div>
                              </div>
                            )}
                            {/* 1st place */}
                            {catRankings[0] && (
                              <div className="live-podium-step step-1">
                                <div className="live-podium-avatar">🥇</div>
                                <span className="live-podium-name">{catRankings[0].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[0].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[0].bestLap)}</span>
                                <div className="live-podium-block gold">1</div>
                              </div>
                            )}
                            {/* 3rd place */}
                            {catRankings[2] && (
                              <div className="live-podium-step step-3">
                                <div className="live-podium-avatar">🥉</div>
                                <span className="live-podium-name">{catRankings[2].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[2].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[2].bestLap)}</span>
                                <div className="live-podium-block bronze">3</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    (() => {
                      const catRankings = getRankings(selectedCategory)
                      if (catRankings.length === 0) return <p className="live-rankings-empty">Aucun passage enregistré pour cette catégorie.</p>
                      return (
                        <div className="live-podium-card glass single-podium-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                          <h3 className="live-podium-cat">{selectedCategory}</h3>
                          <div className="live-podium-visual">
                            {/* 2nd place */}
                            {catRankings[1] && (
                              <div className="live-podium-step step-2">
                                <div className="live-podium-avatar">🥈</div>
                                <span className="live-podium-name">{catRankings[1].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[1].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[1].bestLap)}</span>
                                <div className="live-podium-block silver">2</div>
                              </div>
                            )}
                            {/* 1st place */}
                            {catRankings[0] && (
                              <div className="live-podium-step step-1">
                                <div className="live-podium-avatar">🥇</div>
                                <span className="live-podium-name">{catRankings[0].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[0].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[0].bestLap)}</span>
                                <div className="live-podium-block gold">1</div>
                              </div>
                            )}
                            {/* 3rd place */}
                            {catRankings[2] && (
                              <div className="live-podium-step step-3">
                                <div className="live-podium-avatar">🥉</div>
                                <span className="live-podium-name">{catRankings[2].pilot_1_name}</span>
                                <span className="live-podium-chrono">{catRankings[2].totalLaps} Tours</span>
                                <span className="live-podium-best">Min: {formatTime(catRankings[2].bestLap)}</span>
                                <div className="live-podium-block bronze">3</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── Sidebar: Recent Laps Feed ─── */}
          <div className="live-sidebar">
            <div className="live-feed glass">
              <h3 className="live-feed-title">⚡ Derniers Passages</h3>
              <div className="live-feed-list">
                {recentLaps.map(l => {
                  const team = teams.find(t => t.id === l.team_id)
                  const isNew = l.id === highlightedLap
                  return (
                    <div key={l.id} className={`live-feed-item ${isNew ? 'live-feed-new' : ''}`}>
                      <div className="live-feed-moto">#{l.moto_number}</div>
                      <div className="live-feed-details">
                        <span className="live-feed-name">{team?.pilot_1_name || '?'}</span>
                        <span className="live-feed-cat">{team?.category}</span>
                      </div>
                      <div className="live-feed-time">{formatTime(l.lap_time_ms)}</div>
                    </div>
                  )
                })}
                {recentLaps.length === 0 && (
                  <div className="live-feed-empty">Aucun passage enregistré</div>
                )}
              </div>
            </div>

            {/* Stats Card */}
            <div className="live-stats-card glass">
              <h3>📊 Statistiques</h3>
              <div className="live-stats-grid">
                <div className="live-stats-item">
                  <span className="live-stats-val">{teams.length}</span>
                  <span className="live-stats-lbl">Inscrits</span>
                </div>
                <div className="live-stats-item">
                  <span className="live-stats-val">{totalTeams}</span>
                  <span className="live-stats-lbl">En piste</span>
                </div>
                <div className="live-stats-item">
                  <span className="live-stats-val">{totalLaps}</span>
                  <span className="live-stats-lbl">Passages</span>
                </div>
                <div className="live-stats-item">
                  <span className="live-stats-val">{categories.length}</span>
                  <span className="live-stats-lbl">Catégories</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
