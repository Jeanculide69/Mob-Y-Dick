import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import './RaceChrono.css'

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export default function RaceChrono({ raceSession, teams, session, onFinish, onClose }) {
  const [laps, setLaps] = useState([])
  const [motoInput, setMotoInput] = useState('')
  const [chrono, setChrono] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [lastLapFlash, setLastLapFlash] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const inputRef = useRef(null)
  const intervalRef = useRef(null)

  const categories = raceSession?.categories || []

  useEffect(() => {
    loadLaps()
    // Subscribe to realtime lap inserts
    const channel = supabase.channel('race_laps_chrono')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_laps', filter: `session_id=eq.${raceSession.id}` }, () => {
        loadLaps()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [raceSession.id])

  // Chrono timer
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setChrono(Date.now() - startTime)
      }, 10)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning, startTime])

  // Auto-focus the input
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [laps])

  const loadLaps = async () => {
    const { data } = await supabase
      .from('race_laps')
      .select('*')
      .eq('session_id', raceSession.id)
      .order('recorded_at', { ascending: false })
    setLaps(data || [])
  }

  const handleStartChrono = () => {
    setStartTime(Date.now())
    setChrono(0)
    setIsRunning(true)
  }

  const handleResetChrono = () => {
    setIsRunning(false)
    setChrono(0)
    setStartTime(null)
  }

  const handleRecordLap = useCallback(async () => {
    const num = parseInt(motoInput)
    if (!num || !isRunning) return

    const team = teams.find(t => t.moto_number === num)
    if (!team) {
      alert(`Moto #${num} non trouvée dans la liste des équipes !`)
      return
    }

    const lapTime = chrono
    const teamLaps = laps.filter(l => l.team_id === team.id)
    const lapNumber = teamLaps.length + 1

    const { error } = await supabase.from('race_laps').insert([{
      session_id: raceSession.id,
      team_id: team.id,
      moto_number: num,
      lap_time_ms: lapTime,
      lap_number: lapNumber,
      recorded_by: session.user.id,
    }])

    if (error) {
      alert('Erreur: ' + error.message)
      return
    }

    // Flash effect
    setLastLapFlash({ moto: num, time: lapTime, pilot: team.pilot_1_name })
    setTimeout(() => setLastLapFlash(null), 3000)

    // Clear input for next lap - do not reset chrono
    setMotoInput('')
    
    if (inputRef.current) inputRef.current.focus()
  }, [motoInput, isRunning, chrono, laps, teams, raceSession.id, session.user.id])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRecordLap()
    }
  }

  const handleDeleteLap = async (lapId) => {
    if (!confirm('Supprimer ce passage ?')) return
    await supabase.from('race_laps').delete().eq('id', lapId)
    loadLaps()
  }

  const handleFinishRace = async () => {
    if (!confirm('🏁 Terminer la course ? Les chronos ne pourront plus être saisis.')) return
    try {
      const { data, error } = await supabase.from('race_sessions').update({
        status: 'finished',
        finished_at: new Date().toISOString()
      }).eq('id', raceSession.id).select()
      
      if (error) throw error
      if (!data || data.length === 0) throw new Error("La session n'a pas pu être mise à jour. Vérifiez vos permissions.")
      
      if (onFinish) onFinish()
    } catch (err) {
      alert("Erreur lors du changement de statut : " + err.message)
    }
  }

  // Build rankings by category
  const getRankings = () => {
    const rankings = {}
    const catFilter = selectedCategory === 'all' ? categories : [selectedCategory]
    
    catFilter.forEach(cat => {
      const catTeams = teams.filter(t => t.category === cat)
      const teamResults = catTeams.map(team => {
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
          bestLap, 
          totalLaps, 
          laps: teamLaps,
          lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity
        }
      }).filter(t => t.totalLaps > 0)
        .sort((a, b) => {
          if (b.totalLaps !== a.totalLaps) {
            return b.totalLaps - a.totalLaps
          }
          return a.lastPassageTime - b.lastPassageTime
        })
      
      if (teamResults.length > 0) rankings[cat] = teamResults
    })
    return rankings
  }

  const rankings = getRankings()

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
        </div>
        <h2 className="chrono-title">{raceSession.name}</h2>
        <button className="btn btn-outline chrono-finish-btn" onClick={handleFinishRace}>
          🏁 Terminer
        </button>
      </div>

      <div className="chrono-layout">
        {/* ─── Left: Chrono + Input ─── */}
        <div className="chrono-panel-left">
          {/* Big Chrono Display */}
          <div className="chrono-display glass">
            <div className="chrono-time">{formatTime(chrono)}</div>
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
                onClick={handleRecordLap}
                disabled={!isRunning || !motoInput}
              >
                ⏱️ ENREGISTRER
              </button>
            </div>
            {motoInput && teams.find(t => t.moto_number === parseInt(motoInput)) && (
              <div className="chrono-moto-preview">
                {(() => {
                  const t = teams.find(t => t.moto_number === parseInt(motoInput))
                  return t ? `${t.category} — ${t.pilot_1_name}` : ''
                })()}
              </div>
            )}
          </div>

          {/* Last Lap Flash */}
          {lastLapFlash && (
            <div className="chrono-flash glass">
              <span className="chrono-flash-moto">#{lastLapFlash.moto}</span>
              <span className="chrono-flash-time">{formatTime(lastLapFlash.time)}</span>
              <span className="chrono-flash-pilot">{lastLapFlash.pilot}</span>
            </div>
          )}

          {/* Recent Laps */}
          <div className="chrono-recent glass">
            <h3>⏱️ Derniers Passages ({laps.length})</h3>
            <div className="chrono-recent-list">
              {laps.slice(0, 15).map(l => {
                const team = teams.find(t => t.id === l.team_id)
                return (
                  <div key={l.id} className="chrono-recent-item">
                    <span className="chrono-recent-moto">#{l.moto_number}</span>
                    <span className="chrono-recent-name">{team?.pilot_1_name || '?'}</span>
                    <span className="chrono-recent-time">{formatTime(l.lap_time_ms)}</span>
                    <button className="chrono-recent-delete" onClick={() => handleDeleteLap(l.id)}>✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ─── Right: Live Rankings ─── */}
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
              <div className="chrono-rankings-empty">
                En attente des premiers passages...
              </div>
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
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={r.id} className={i < 3 ? `chrono-podium-${i + 1}` : ''}>
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
