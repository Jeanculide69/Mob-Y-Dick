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

export default function LiveRace() {
  const [session, setSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [laps, setLaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [highlightedLap, setHighlightedLap] = useState(null)
  const [eventInfo, setEventInfo] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(null)

  useEffect(() => {
    loadLiveSession()
  }, [])

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
    // Find any live or recently finished session
    const { data: sessions } = await supabase
      .from('race_sessions')
      .select('*')
      .in('status', ['live', 'finished', 'published'])
      .order('created_at', { ascending: false })
      .limit(1)

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

      // Realtime subscriptions
      const channel = supabase.channel('live_race_public')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_laps', filter: `session_id=eq.${s.id}` }, (payload) => {
          setLaps(prev => [payload.new, ...prev])
          setHighlightedLap(payload.new.id)
          setTimeout(() => setHighlightedLap(null), 4000)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${s.id}` }, (payload) => {
          setSession(payload.new)
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
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
    return catTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id)
      const bestLap = teamLaps.length > 0 ? Math.min(...teamLaps.map(l => l.lap_time_ms)) : null
      const avgLap = teamLaps.length > 0 ? Math.round(teamLaps.reduce((s, l) => s + l.lap_time_ms, 0) / teamLaps.length) : null
      const lastLap = teamLaps.length > 0 ? teamLaps[0]?.lap_time_ms : null
      return { ...team, bestLap, avgLap, lastLap, totalLaps: teamLaps.length, laps: teamLaps }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => (a.bestLap || Infinity) - (b.bestLap || Infinity))
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
            {isFinished && selectedCategory === 'all' && (
              <div className="live-podiums-section">
                <h2 className="live-podiums-title">🏆 Podiums par Catégorie</h2>
                <div className="live-podiums-grid">
                  {categories.map(cat => {
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
                              <span className="live-podium-chrono">{formatTime(catRankings[1].bestLap)}</span>
                              <div className="live-podium-block silver">2</div>
                            </div>
                          )}
                          {/* 1st place */}
                          {catRankings[0] && (
                            <div className="live-podium-step step-1">
                              <div className="live-podium-avatar">🥇</div>
                              <span className="live-podium-name">{catRankings[0].pilot_1_name}</span>
                              <span className="live-podium-chrono">{formatTime(catRankings[0].bestLap)}</span>
                              <div className="live-podium-block gold">1</div>
                            </div>
                          )}
                          {/* 3rd place */}
                          {catRankings[2] && (
                            <div className="live-podium-step step-3">
                              <div className="live-podium-avatar">🥉</div>
                              <span className="live-podium-name">{catRankings[2].pilot_1_name}</span>
                              <span className="live-podium-chrono">{formatTime(catRankings[2].bestLap)}</span>
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
