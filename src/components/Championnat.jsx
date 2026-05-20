import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './Championnat.css'

// F1-style points system
const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export default function Championnat() {
  const [sessions, setSessions]     = useState([])
  const [leaderboard, setLeaderboard] = useState({}) // category → [{name, points, results:[]}]
  const [loading, setLoading]       = useState(true)
  const [selectedCat, setSelectedCat] = useState('all')
  const [allCategories, setAllCategories] = useState([])

  useEffect(() => { loadChampionship() }, [])

  const loadChampionship = async () => {
    setLoading(true)

    // 1. Fetch all published sessions
    const { data: sessionData } = await supabase
      .from('race_sessions')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: true })

    if (!sessionData || sessionData.length === 0) {
      setLoading(false)
      return
    }

    setSessions(sessionData)

    // 2. Fetch all teams + laps for those sessions in parallel
    const sessionIds = sessionData.map(s => s.id)

    const [{ data: teamsData }, { data: lapsData }] = await Promise.all([
      supabase.from('race_teams').select('*').in('session_id', sessionIds),
      supabase.from('race_laps').select('*').in('session_id', sessionIds),
    ])

    const teams = teamsData || []
    const laps  = lapsData  || []

    // 3. Collect all categories across sessions
    const cats = new Set()
    sessionData.forEach(s => (s.categories || []).forEach(c => cats.add(c)))
    const categories = [...cats]
    setAllCategories(categories)

    // 4. Build points accumulator: { pilotKey → { name, points, wins, sessions, bestLap, category } }
    //    pilotKey = `${category}__${pilot_1_name}`
    const accumulator = {}

    const addPoints = (name, cat, pts, sessionName, position, bestLapMs) => {
      const key = `${cat}__${name}`
      if (!accumulator[key]) {
        accumulator[key] = { name, category: cat, points: 0, wins: 0, podiums: 0, sessionResults: [], bestLap: null }
      }
      accumulator[key].points += pts
      if (position === 1) accumulator[key].wins++
      if (position <= 3) accumulator[key].podiums++
      accumulator[key].sessionResults.push({ sessionName, position, pts, bestLapMs })
      if (bestLapMs && (!accumulator[key].bestLap || bestLapMs < accumulator[key].bestLap)) {
        accumulator[key].bestLap = bestLapMs
      }
    }

    // 5. For each session × category → compute ranking → award points
    sessionData.forEach(sess => {
      const sessTeams = teams.filter(t => t.session_id === sess.id)
      const sessLaps  = laps.filter(l => l.session_id === sess.id)
      const sessCats  = sess.categories || []

      sessCats.forEach(cat => {
        const catTeams = sessTeams.filter(t => t.category === cat)

        const ranked = catTeams.map(team => {
          const teamLaps = sessLaps
            .filter(l => l.team_id === team.id)
            .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
          const totalLaps = teamLaps.length
          const splits = teamLaps.map((lap, idx) =>
            idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
          )
          const bestLap = splits.length ? Math.min(...splits) : null
          const lastPassageTime = totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity
          return { team, totalLaps, bestLap, lastPassageTime }
        })
        .filter(r => r.totalLaps > 0)
        .sort((a, b) =>
          b.totalLaps !== a.totalLaps
            ? b.totalLaps - a.totalLaps
            : a.lastPassageTime - b.lastPassageTime
        )

        ranked.forEach((r, i) => {
          const pts = POINTS_TABLE[i] || 0
          const pilotName = r.team.pilot_1_name
          addPoints(pilotName, cat, pts, sess.name, i + 1, r.bestLap)
        })
      })
    })

    // 6. Build per-category leaderboards
    const board = {}
    categories.forEach(cat => {
      const entries = Object.values(accumulator)
        .filter(e => e.category === cat)
        .sort((a, b) => b.points !== a.points ? b.points - a.points : b.wins - a.wins)
      if (entries.length > 0) board[cat] = entries
    })
    setLeaderboard(board)
    setLoading(false)
  }

  if (loading) return (
    <section className="section page-top">
      <div className="container">
        <div className="champ-loading">
          <div className="champ-spinner" />
          <p>Calcul du championnat...</p>
        </div>
      </div>
    </section>
  )

  const hasData = Object.keys(leaderboard).length > 0

  const displayedCats = selectedCat === 'all' ? allCategories : [selectedCat]

  return (
    <section className="section page-top">
      <div className="container">

        {/* ── Header ── */}
        <div className="champ-header">
          <div className="champ-header-left">
            <h1 className="champ-title">🏆 Championnat</h1>
            <p className="champ-subtitle">
              Classement général de la saison — {sessions.length} manche{sessions.length > 1 ? 's' : ''} disputée{sessions.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="champ-points-legend">
            <span className="champ-legend-label">Barème points</span>
            <div className="champ-points-chips">
              {POINTS_TABLE.slice(0, 5).map((p, i) => (
                <span key={i} className="champ-point-chip">
                  {i + 1}<sup>e</sup> → {p}pts
                </span>
              ))}
              <span className="champ-point-chip champ-point-chip-muted">…</span>
            </div>
          </div>
        </div>

        {/* ── Sessions list ── */}
        {sessions.length > 0 && (
          <div className="champ-sessions-strip">
            {sessions.map((s, i) => (
              <div key={s.id} className="champ-session-chip">
                <span className="champ-session-num">M{i + 1}</span>
                <span className="champ-session-name">{s.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Category Tabs ── */}
        {allCategories.length > 1 && (
          <div className="champ-cat-tabs">
            <button
              className={`champ-cat-tab ${selectedCat === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCat('all')}
            >
              Toutes
            </button>
            {allCategories.map(c => (
              <button
                key={c}
                className={`champ-cat-tab ${selectedCat === c ? 'active' : ''}`}
                onClick={() => setSelectedCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* ── No data ── */}
        {!hasData && (
          <div className="champ-empty glass">
            <span className="champ-empty-icon">🏁</span>
            <h2>Aucun résultat disponible</h2>
            <p>Le championnat affiche les résultats des manches officiellement publiées. Revenez après la prochaine course !</p>
          </div>
        )}

        {/* ── Per-category leaderboards ── */}
        {displayedCats.map(cat => {
          const entries = leaderboard[cat]
          if (!entries) return null
          const leader = entries[0]

          return (
            <div key={cat} className="champ-cat-block">
              <div className="champ-cat-header">
                <h2 className="champ-cat-title">{cat}</h2>
                {leader && (
                  <div className="champ-cat-leader">
                    <span className="champ-leader-crown">👑</span>
                    <span className="champ-leader-name">{leader.name}</span>
                    <span className="champ-leader-pts">{leader.points} pts</span>
                  </div>
                )}
              </div>

              {/* Top 3 visual podium */}
              <div className="champ-podium-visual">
                {entries[1] && (
                  <div className="champ-podium-step champ-step-2">
                    <div className="champ-podium-avatar">🥈</div>
                    <div className="champ-podium-pilot-name">{entries[1].name}</div>
                    <div className="champ-podium-pts">{entries[1].points} pts</div>
                    <div className="champ-podium-block silver">2</div>
                  </div>
                )}
                {entries[0] && (
                  <div className="champ-podium-step champ-step-1">
                    <div className="champ-podium-avatar">🥇</div>
                    <div className="champ-podium-pilot-name">{entries[0].name}</div>
                    <div className="champ-podium-pts">{entries[0].points} pts</div>
                    <div className="champ-podium-block gold">1</div>
                  </div>
                )}
                {entries[2] && (
                  <div className="champ-podium-step champ-step-3">
                    <div className="champ-podium-avatar">🥉</div>
                    <div className="champ-podium-pilot-name">{entries[2].name}</div>
                    <div className="champ-podium-pts">{entries[2].points} pts</div>
                    <div className="champ-podium-block bronze">3</div>
                  </div>
                )}
              </div>

              {/* Full leaderboard table */}
              <div className="champ-table-wrap glass">
                <table className="champ-table">
                  <thead>
                    <tr>
                      <th className="champ-th-pos">POS</th>
                      <th>PILOTE</th>
                      <th className="champ-th-num">POINTS</th>
                      <th className="champ-th-num">VICTOIRES</th>
                      <th className="champ-th-num">PODIUMS</th>
                      <th className="champ-th-num">MEILLEUR</th>
                      {sessions.map((s, i) => (
                        <th key={s.id} className="champ-th-session">M{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => {
                      const isLeader = i === 0
                      const gap = isLeader ? null : leader.points - entry.points
                      return (
                        <tr key={entry.name} className={`champ-row ${i < 3 ? `champ-podium-${i + 1}` : ''}`}>
                          <td className="champ-pos">
                            {i === 0 && <span className="champ-medal gold">1</span>}
                            {i === 1 && <span className="champ-medal silver">2</span>}
                            {i === 2 && <span className="champ-medal bronze">3</span>}
                            {i > 2 && <span className="champ-pos-num">{i + 1}</span>}
                          </td>
                          <td className="champ-pilot">
                            <span className="champ-pilot-name">{entry.name}</span>
                            {!isLeader && gap !== null && (
                              <span className="champ-gap">-{gap} pts</span>
                            )}
                          </td>
                          <td className="champ-points-cell">
                            <span className={`champ-pts-value ${isLeader ? 'leader' : ''}`}>
                              {entry.points}
                            </span>
                          </td>
                          <td className="champ-num-cell">
                            {entry.wins > 0 ? <span className="champ-wins">{entry.wins}🏆</span> : <span className="champ-zero">—</span>}
                          </td>
                          <td className="champ-num-cell">
                            {entry.podiums > 0 ? <span className="champ-podiums">{entry.podiums}🎖️</span> : <span className="champ-zero">—</span>}
                          </td>
                          <td className="champ-num-cell champ-best-lap">
                            {entry.bestLap ? formatTime(entry.bestLap) : '—'}
                          </td>
                          {sessions.map(s => {
                            const res = entry.sessionResults.find(r => r.sessionName === s.name)
                            return (
                              <td key={s.id} className="champ-session-result">
                                {res ? (
                                  <div className="champ-result-pill">
                                    <span className="champ-result-pos">P{res.position}</span>
                                    <span className="champ-result-pts">+{res.pts}</span>
                                  </div>
                                ) : (
                                  <span className="champ-zero">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

      </div>
    </section>
  )
}
