import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import './RaceChrono.css'

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

// XXL Numpad digits layout
const NUMPAD_KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['⌫', '0', '✓'],
]

export default function RaceChrono({ raceSession, teams, session, onFinish, onClose }) {
  const [laps, setLaps]                     = useState([])
  const [motoInput, setMotoInput]           = useState('')
  const [chrono, setChrono]                 = useState(0)
  const [sessionData, setSessionData]       = useState(raceSession)
  const [lastLapFlash, setLastLapFlash]     = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')

  // ── New feature states ──
  const [lastInsertedLapId, setLastInsertedLapId] = useState(null)
  const [undoCountdown, setUndoCountdown]         = useState(0)
  const [announcement, setAnnouncement]           = useState('')
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
  const [announceSent, setAnnounceSent]           = useState(false)
  const [xxlMode, setXxlMode]                     = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  )
  const [teamStatuses, setTeamStatuses]           = useState({}) // teamId → 'DNF' | 'DNS' | null

  const inputRef       = useRef(null)
  const intervalRef    = useRef(null)
  const undoTimerRef   = useRef(null)
  const extrasChannelRef = useRef(null)

  const categories = raceSession?.categories || []
  const isRunning = !!sessionData?.started_at && sessionData?.status === 'live'
  const startTime = sessionData?.started_at ? new Date(sessionData.started_at).getTime() : null

  // Sync prop changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSessionData(raceSession) }, [raceSession])

  // Subscribe to extras channel for sending announcements + team statuses
  useEffect(() => {
    const ch = supabase.channel(`live-extras-${raceSession.id}`).subscribe()
    extrasChannelRef.current = ch
    return () => supabase.removeChannel(ch)
  }, [raceSession.id])

  const loadLaps = async () => {
    const { data } = await supabase
      .from('race_laps')
      .select('*')
      .eq('session_id', raceSession.id)
      .order('recorded_at', { ascending: false })
    setLaps(data || [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLaps()
    const channel = supabase.channel('race_laps_chrono')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_laps', filter: `session_id=eq.${raceSession.id}` }, () => {
        loadLaps()
      })
      .subscribe()

    const sessionChannel = supabase.channel(`race_session_sync_${raceSession.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_sessions', filter: `id=eq.${raceSession.id}` }, (payload) => {
        if (payload.new) setSessionData(payload.new)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(sessionChannel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceSession.id])

  // Chrono timer
  useEffect(() => {
    if (isRunning && startTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChrono(Date.now() - startTime)
      intervalRef.current = setInterval(() => {
        setChrono(Date.now() - startTime)
      }, 10)
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

  // Auto-focus the input (non-XXL mode)
  useEffect(() => {
    if (!xxlMode && inputRef.current) inputRef.current.focus()
  }, [laps, xxlMode])

  // Undo countdown cleanup
  useEffect(() => () => clearInterval(undoTimerRef.current), [])

  // Verrouille le scroll du body quand le mode XXL est actif : l'overlay
  // est sur le body via Portal et la page derrière ne doit pas bouger.
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

  const handleRecordLap = useCallback(async (overrideMoto) => {
    const num = parseInt(overrideMoto ?? motoInput)
    if (!num || !isRunning) return

    const team = teams.find(t => t.moto_number === num)
    if (!team) {
      alert(`Moto #${num} non trouvée dans la liste des équipes !`)
      return
    }

    const lapTime = chrono
    const teamLaps = laps.filter(l => l.team_id === team.id)
    const lapNumber = teamLaps.length + 1

    // Use .select() to get the inserted row's ID for undo
    const { data, error } = await supabase.from('race_laps').insert([{
      session_id: raceSession.id,
      team_id: team.id,
      moto_number: num,
      lap_time_ms: lapTime,
      lap_number: lapNumber,
      recorded_by: session.user.id,
    }]).select()

    if (error) {
      alert('Erreur: ' + error.message)
      return
    }

    // Start undo window
    if (data?.[0]) {
      const newId = data[0].id
      setLastInsertedLapId(newId)
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
    }

    setLastLapFlash({ moto: num, time: lapTime, pilot: team.pilot_1_name })
    setTimeout(() => setLastLapFlash(null), 3000)

    setMotoInput('')
    if (!xxlMode && inputRef.current) inputRef.current.focus()
  }, [motoInput, isRunning, chrono, laps, teams, raceSession.id, session.user.id, xxlMode])

  const handleUndoLastLap = async () => {
    if (!lastInsertedLapId) return
    clearInterval(undoTimerRef.current)
    await supabase.from('race_laps').delete().eq('id', lastInsertedLapId)
    setLastInsertedLapId(null)
    setUndoCountdown(0)
    setLastLapFlash(null)
    loadLaps()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRecordLap() }
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
      // Enregistrer en base de données pour l'historique
      const { error } = await supabase.from('race_announcements').insert([
        { session_id: raceSession.id, message: text }
      ])
      if (error) console.error('Erreur sauvegarde annonce:', error)

      // Diffuser en direct pour affichage instantané
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

  // ── Team DNF / DNS ──
  const setTeamStatus = async (teamId, status) => {
    const newStatus = teamStatuses[teamId] === status ? null : status
    setTeamStatuses(prev => ({ ...prev, [teamId]: newStatus }))
    // Broadcast to spectators in LiveRace
    await extrasChannelRef.current?.send({
      type: 'broadcast',
      event: 'team-status',
      payload: { teamId, status: newStatus }
    })
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

  // ── Rankings ──
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
          const durations = teamLaps.map((lap, idx) => idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms)
          bestLap = Math.min(...durations)
        }
        return {
          ...team, bestLap, totalLaps, laps: teamLaps,
          lastPassageTime: totalLaps > 0 ? teamLaps[totalLaps - 1].lap_time_ms : Infinity,
          status: teamStatuses[team.id] || null
        }
      }).filter(t => t.totalLaps > 0)
        .sort((a, b) => b.totalLaps !== a.totalLaps ? b.totalLaps - a.totalLaps : a.lastPassageTime - b.lastPassageTime)
      if (teamResults.length > 0) rankings[cat] = teamResults
    })
    return rankings
  }

  const rankings = getRankings()
  const previewTeam = motoInput ? teams.find(t => t.moto_number === parseInt(motoInput)) : null

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
          <div className="chrono-xxl-timer">{formatTime(chrono)}</div>
          <div className="chrono-xxl-badge">
            {isRunning ? <><span className="chrono-live-dot" />EN DIRECT</> : '⏸ EN ATTENTE'}
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
                onClick={() => handleRecordLap()}
                disabled={!isRunning || !motoInput}
              >
                ⏱️ ENREGISTRER
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
                        <tr key={r.id} className={`${i < 3 ? `chrono-podium-${i + 1}` : ''} ${r.status ? 'chrono-row-inactive' : ''}`}>
                          <td className="chrono-pos">
                            {r.status ? '—' : (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1)}
                          </td>
                          <td className="chrono-num">#{r.moto_number}</td>
                          <td className="chrono-pilot">{r.pilot_1_name}</td>
                          <td className="chrono-best">{formatTime(r.bestLap)}</td>
                          <td className="chrono-laps-count">{r.totalLaps}</td>
                          <td className="chrono-status-cell">
                            <button
                              className={`chrono-status-btn ${r.status === 'DNF' ? 'active-dnf' : ''}`}
                              // eslint-disable-next-line react-hooks/refs
                              onClick={() => setTeamStatus(r.id, 'DNF')}
                              title="Marquer DNF (Did Not Finish)"
                            >DNF</button>
                            <button
                              className={`chrono-status-btn ${r.status === 'DNS' ? 'active-dns' : ''}`}

                              onClick={() => setTeamStatus(r.id, 'DNS')}
                              title="Marquer DNS (Did Not Start)"
                            >DNS</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>

          {/* DNF/DNS legend */}
          {Object.values(teamStatuses).some(Boolean) && (
            <div className="chrono-status-legend glass">
              <h4>⚠️ Statuts spéciaux</h4>
              {teams.filter(t => teamStatuses[t.id]).map(t => (
                <div key={t.id} className="chrono-status-legend-item">
                  <span>#{t.moto_number} {t.pilot_1_name}</span>
                  <span className={`chrono-status-badge ${teamStatuses[t.id] === 'DNF' ? 'badge-dnf' : 'badge-dns'}`}>
                    {teamStatuses[t.id]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
