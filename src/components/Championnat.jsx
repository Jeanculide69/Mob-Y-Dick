import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { formatCategoryShort } from '../utils/formatCategory'
import './Championnat.css'

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

export default function Championnat() {
  const [sessions, setSessions]             = useState([])
  const [rawTeams, setRawTeams]             = useState([])
  const [rawLaps, setRawLaps]               = useState([])
  const [selectedSessions, setSelectedSessions] = useState([])
  const [leaderboard, setLeaderboard]       = useState({}) // category → [{name, laps, wins, podiums, sessionResults:[], bestLap, totalTime}]
  const [loading, setLoading]               = useState(true)
  const [selectedCat, setSelectedCat]       = useState('all')
  const [allCategories, setAllCategories]   = useState([])
  const [champFemaleWinner, setChampFemaleWinner] = useState(null)
  const [champJuniorWinner, setChampJuniorWinner] = useState(null)

  const loadChampionship = async () => {
    try {
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
      setSelectedSessions(sessionData.map(s => s.id))

      // 2. Fetch all teams + laps for those sessions in parallel
      const sessionIds = sessionData.map(s => s.id)

      const [{ data: teamsData }, { data: lapsData }] = await Promise.all([
        supabase.from('race_teams').select('*').in('session_id', sessionIds),
        supabase.from('race_laps').select('*').in('session_id', sessionIds),
      ])

      setRawTeams(teamsData || [])
      setRawLaps(lapsData || [])
    } catch (err) {
      console.error("Error loading championship data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChampionship()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessions.length === 0) {
        setLeaderboard({})
        setAllCategories([])
        setChampFemaleWinner(null)
        setChampJuniorWinner(null)
        return
      }

      // 3. Filter sessions by selection
      const selectedSessData = sessions.filter(s => selectedSessions.includes(s.id))
      
      // Collect all categories across selected sessions
      const cats = new Set()
      selectedSessData.forEach(s => (s.categories || []).forEach(c => cats.add(c)))
      const categories = [...cats]
      setAllCategories(categories)

      // 4. Build laps accumulator: { pilotKey → { name, category, laps, wins, podiums, sessionResults, bestLap, totalTime } }
      const accumulator = {}

      const addLaps = (name, cat, lapsCount, sessionName, position, bestLapMs, totalTimeMs, team) => {
        const key = `${cat}__${name}`
        if (!accumulator[key]) {
          accumulator[key] = { 
            name, 
            category: cat, 
            laps: 0, 
            wins: 0, 
            podiums: 0, 
            sessionResults: [], 
            bestLap: null,
            totalTime: 0,
            team: team
          }
        }
        accumulator[key].laps += lapsCount
        if (position === 1) accumulator[key].wins++
        if (position <= 3) accumulator[key].podiums++
        accumulator[key].sessionResults.push({ sessionName, position, laps: lapsCount, bestLapMs })
        if (totalTimeMs && totalTimeMs !== Infinity) {
          accumulator[key].totalTime += totalTimeMs
        }
        if (bestLapMs && (!accumulator[key].bestLap || bestLapMs < accumulator[key].bestLap)) {
          accumulator[key].bestLap = bestLapMs
        }
      }

      // 5. For each selected session × category → compute ranking → award laps
      selectedSessData.forEach(sess => {
        const sessTeams = rawTeams.filter(t => t.session_id === sess.id)
        const sessLaps  = rawLaps.filter(l => l.session_id === sess.id)
        const sessCats  = sess.categories || []

        sessCats.forEach(cat => {
          const catTeams = sessTeams.filter(t => t.category === cat)

          const ranked = catTeams.map(team => {
            const teamLaps = sessLaps
              .filter(l => l.team_id === team.id)
              .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
            const actualLapsCount = teamLaps.length
            const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
            const splits = teamLaps.map((lap, idx) =>
              idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
            )
            const bestLap = splits.length ? Math.min(...splits) : null
            const lastPassageTime = actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
            return { team, totalLaps, bestLap, lastPassageTime }
          })
          .filter(r => r.totalLaps > 0)
          .sort((a, b) =>
            b.totalLaps !== a.totalLaps
              ? b.totalLaps - a.totalLaps
              : a.lastPassageTime - b.lastPassageTime
          )

          ranked.forEach((r, i) => {
            const identifier = `Moto ${r.team.moto_number}`
            addLaps(identifier, cat, r.totalLaps, sess.name, i + 1, r.bestLap, r.lastPassageTime, r.team)
          })
        })
      })

      // 6. Build per-category leaderboards
      const board = {}
      categories.forEach(cat => {
        const entries = Object.values(accumulator)
          .filter(e => e.category === cat)
          .sort((a, b) => {
            if (b.laps !== a.laps) {
              return b.laps - a.laps
            }
            return a.totalTime - b.totalTime
          })
        if (entries.length > 0) board[cat] = entries
      })
      setLeaderboard(board)

      // Calculate championship overall winners
      const allEntries = Object.values(accumulator)
      const femaleEntries = allEntries.filter(e => 
        e.team && (
          e.team.pilot_1_sex === 'F' || 
          e.team.pilot_2_sex === 'F' || 
          e.team.pilot_3_sex === 'F'
        )
      ).sort((a, b) => {
        if (b.laps !== a.laps) return b.laps - a.laps
        return a.totalTime - b.totalTime
      })

      const juniorEntries = allEntries.filter(e => 
        e.team && (
          e.team.pilot_1_sex === 'J' || 
          e.team.pilot_2_sex === 'J' || 
          e.team.pilot_3_sex === 'J'
        )
      ).sort((a, b) => {
        if (b.laps !== a.laps) return b.laps - a.laps
        return a.totalTime - b.totalTime
      })

      setChampFemaleWinner(femaleEntries[0] || null)
      setChampJuniorWinner(juniorEntries[0] || null)
    }, 0)

    return () => clearTimeout(timer)
  }, [selectedSessions, rawTeams, rawLaps, sessions])

  const handleToggleSession = (id) => {
    setSelectedSessions(prev =>
      prev.includes(id)
        ? prev.filter(sessId => sessId !== id)
        : [...prev, id]
    )
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

  const hasData = Object.keys(leaderboard).length > 0 && selectedSessions.length > 0
  const displayedCats = selectedCat === 'all' ? allCategories : [selectedCat]

  const champFemaleNames = []
  if (champFemaleWinner && champFemaleWinner.team) {
    const t = champFemaleWinner.team
    if (t.pilot_1_sex === 'F') champFemaleNames.push(t.pilot_1_name)
    if (t.pilot_2_sex === 'F') champFemaleNames.push(t.pilot_2_name)
    if (t.pilot_3_sex === 'F') champFemaleNames.push(t.pilot_3_name)
  }

  const champJuniorNames = []
  if (champJuniorWinner && champJuniorWinner.team) {
    const t = champJuniorWinner.team
    if (t.pilot_1_sex === 'J') champJuniorNames.push(t.pilot_1_name)
    if (t.pilot_2_sex === 'J') champJuniorNames.push(t.pilot_2_name)
    if (t.pilot_3_sex === 'J') champJuniorNames.push(t.pilot_3_name)
  }

  return (
    <section className="section page-top">
      <div className="container">

        {/* ── Header ── */}
        <div className="champ-header">
          <div className="champ-header-left">
            <h1 className="champ-title">🏆 Championnat</h1>
            <p className="champ-subtitle">
              Cumul des manches de la saison par nombre de tours
            </p>
          </div>
        </div>

        {/* ── Sessions selection checkboxes ── */}
        {sessions.length > 0 && (
          <div className="champ-sessions-section glass" style={{ padding: '20px', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📅 Choisir les manches à inclure :
            </h4>
            <div className="champ-sessions-checkboxes" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {sessions.map((s, i) => {
                const isSelected = selectedSessions.includes(s.id)
                return (
                  <label 
                    key={s.id} 
                    className={`champ-session-label ${isSelected ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      borderRadius: '20px',
                      background: isSelected ? 'rgba(255, 85, 0, 0.12)' : 'rgba(255,255,255,0.03)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all 0.2s',
                      fontWeight: 600
                    }}
                  >
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSession(s.id)}
                      style={{
                        accentColor: 'var(--accent)',
                        cursor: 'pointer'
                      }}
                    />
                    <span>Manche {i + 1} — {s.name}</span>
                  </label>
                )
              })}
            </div>
            {selectedSessions.length === 0 && (
              <p style={{ color: '#ff4444', fontSize: '0.85rem', marginTop: '12px', fontWeight: 600 }}>
                ⚠️ Sélectionnez au moins une manche ci-dessus pour afficher le classement.
              </p>
            )}
          </div>
        )}

        {/* ── Category Tabs ── */}
        {hasData && allCategories.length > 1 && (
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
                title={c}
              >
                {formatCategoryShort(c)}
              </button>
            ))}
          </div>
        )}

        {/* ── No data ── */}
        {!hasData && (
          <div className="champ-empty glass">
            <span className="champ-empty-icon">🏁</span>
            <h2>Aucun résultat disponible</h2>
            <p>
              {selectedSessions.length === 0 
                ? "Veuillez cocher au moins une manche ci-dessus pour afficher les totaux."
                : "Le championnat affiche les résultats des manches officiellement publiées. Revenez après la prochaine course !"}
            </p>
          </div>
        )}

        {/* Overall championship winners side-by-side */}
        {hasData && selectedCat === 'all' && (champFemaleWinner || champJuniorWinner) && (
          <div className="champ-special-winners-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            {champFemaleWinner && (
              <div className="female-winner-card glass" style={{ margin: 0 }}>
                <div className="female-winner-header">
                  <span className="female-crown-badge">👑 Coupe Féminine du Championnat</span>
                  <h4>Championne Féminine</h4>
                </div>
                <div className="female-winner-body">
                  <div className="female-winner-trophy">🏆</div>
                  <div className="female-winner-details">
                    <span className="female-pilot-name">{champFemaleNames.join(' & ')}</span>
                    <span className="female-pilot-team">{champFemaleWinner.name} — {champFemaleWinner.category}</span>
                    <span className="female-pilot-stats">{champFemaleWinner.laps} Tours cumulés — Meilleur tour : {formatTime(champFemaleWinner.bestLap)}</span>
                  </div>
                </div>
              </div>
            )}

            {champJuniorWinner && (
              <div className="junior-winner-card glass" style={{ margin: 0 }}>
                <div className="female-winner-header">
                  <span className="junior-crown-badge">👑 Coupe Junior du Championnat</span>
                  <h4>Champion Junior</h4>
                </div>
                <div className="female-winner-body">
                  <div className="female-winner-trophy">🏆</div>
                  <div className="female-winner-details">
                    <span className="junior-pilot-name">{champJuniorNames.join(' & ')}</span>
                    <span className="female-pilot-team">{champJuniorWinner.name} — {champJuniorWinner.category}</span>
                    <span className="female-pilot-stats">{champJuniorWinner.laps} Tours cumulés — Meilleur tour : {formatTime(champJuniorWinner.bestLap)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Per-category leaderboards ── */}
        {hasData && displayedCats.map(cat => {
          const entries = leaderboard[cat]
          if (!entries) return null
          const leader = entries[0]

          return (
            <div key={cat} className="champ-cat-block">
              <div className="champ-cat-header">
                <h2 className="champ-cat-title" title={cat}>{formatCategoryShort(cat)}</h2>
                {leader && (
                  <div className="champ-cat-leader">
                    <span className="champ-leader-crown">👑</span>
                    <span className="champ-leader-name">{leader.name}</span>
                    <span className="champ-leader-pts">{leader.laps} Tours</span>
                  </div>
                )}
              </div>

              {/* Top 3 visual podium */}
              <div className="champ-podium-visual">
                {entries[1] && (
                  <div className="champ-podium-step champ-step-2">
                    <div className="champ-podium-avatar">🥈</div>
                    <div className="champ-podium-pilot-name">{entries[1].name}</div>
                    <div className="champ-podium-pts">{entries[1].laps} Tours</div>
                    <div className="champ-podium-block silver">2</div>
                  </div>
                )}
                {entries[0] && (
                  <div className="champ-podium-step champ-step-1">
                    <div className="champ-podium-avatar">🥇</div>
                    <div className="champ-podium-pilot-name">{entries[0].name}</div>
                    <div className="champ-podium-pts">{entries[0].laps} Tours</div>
                    <div className="champ-podium-block gold">1</div>
                  </div>
                )}
                {entries[2] && (
                  <div className="champ-podium-step champ-step-3">
                    <div className="champ-podium-avatar">🥉</div>
                    <div className="champ-podium-pilot-name">{entries[2].name}</div>
                    <div className="champ-podium-pts">{entries[2].laps} Tours</div>
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
                      <th>MOTO</th>
                      <th className="champ-th-num">TOURS TOTAL</th>
                      <th className="champ-th-num">VICTOIRES</th>
                      <th className="champ-th-num">PODIUMS</th>
                      <th className="champ-th-num">MEILLEUR</th>
                      {sessions.filter(s => selectedSessions.includes(s.id)).map(s => (
                        <th key={s.id} className="champ-th-session">M{sessions.indexOf(s) + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => {
                      const isLeader = i === 0
                      const gap = isLeader ? null : leader.laps - entry.laps
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
                              <span className="champ-gap">-{gap} Trs</span>
                            )}
                          </td>
                          <td className="champ-points-cell">
                            <span className={`champ-pts-value ${isLeader ? 'leader' : ''}`}>
                              {entry.laps}
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
                          {sessions.filter(s => selectedSessions.includes(s.id)).map(s => {
                            const res = entry.sessionResults.find(r => r.sessionName === s.name)
                            return (
                              <td key={s.id} className="champ-session-result">
                                {res ? (
                                  <div className="champ-result-pill">
                                    <span className="champ-result-pos">P{res.position}</span>
                                    <span className="champ-result-pts">{res.laps} Trs</span>
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
