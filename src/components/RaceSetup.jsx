import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import AgoraRTC from 'agora-rtc-sdk-ng'
import './RaceSetup.css'

const DEFAULT_CATEGORIES = ['Prototype', 'Cadre en V', 'Origine', '50cc', '70cc']

const DEMO_TEAMS = [
  { moto_number: 11, category: 'Prototype', pilot_1_name: 'Maxime Durand', pilot_1_sex: 'M', pilot_2_name: 'Lucas Martin', pilot_2_sex: 'M' },
  { moto_number: 12, category: 'Prototype', pilot_1_name: 'Arthur Chevalier', pilot_1_sex: 'M', pilot_2_name: 'Chloé Dubois', pilot_2_sex: 'F' },
  { moto_number: 13, category: 'Prototype', pilot_1_name: 'Florian Girard', pilot_1_sex: 'M', pilot_2_name: 'Jean-Marc Lartigue', pilot_2_sex: 'M' },
  { moto_number: 14, category: 'Prototype', pilot_1_name: 'Jérôme Bricard', pilot_1_sex: 'M', pilot_2_name: 'Pierre Vaillant', pilot_2_sex: 'M' },
  { moto_number: 21, category: 'Cadre en V', pilot_1_name: 'Nicolas Vasseur', pilot_1_sex: 'M', pilot_2_name: 'Clément Roussel', pilot_2_sex: 'M' },
  { moto_number: 22, category: 'Cadre en V', pilot_1_name: 'Elodie Bertrand', pilot_1_sex: 'F', pilot_2_name: 'Mathieu Picard', pilot_2_sex: 'M' },
  { moto_number: 23, category: 'Cadre en V', pilot_1_name: 'Thomas Colin', pilot_1_sex: 'M', pilot_2_name: 'Romain Bonnet', pilot_2_sex: 'M' },
  { moto_number: 24, category: 'Cadre en V', pilot_1_name: 'Damien Leclerc', pilot_1_sex: 'M', pilot_2_name: 'Julien Mercier', pilot_2_sex: 'M' },
  { moto_number: 31, category: 'Origine', pilot_1_name: 'Benoît Lemaire', pilot_1_sex: 'M', pilot_2_name: 'Jean Culide', pilot_2_sex: 'M' },
  { moto_number: 32, category: 'Origine', pilot_1_name: 'Sarah Gauthier', pilot_1_sex: 'F', pilot_2_name: 'Alexandre Roy', pilot_2_sex: 'M' },
  { moto_number: 33, category: 'Origine', pilot_1_name: 'Stéphane Vidal', pilot_1_sex: 'M', pilot_2_name: 'Philippe Henry', pilot_2_sex: 'M' },
  { moto_number: 34, category: 'Origine', pilot_1_name: 'Valérie Caron', pilot_1_sex: 'F', pilot_2_name: 'Laurent Fontaine', pilot_2_sex: 'M' },
  { moto_number: 51, category: '50cc', pilot_1_name: 'Hugo Marchand', pilot_1_sex: 'M', pilot_2_name: 'Antoine Aubry', pilot_2_sex: 'M' },
  { moto_number: 52, category: '50cc', pilot_1_name: 'Manon Renard', pilot_1_sex: 'F', pilot_2_name: 'Audrey Dumont', pilot_2_sex: 'F' },
  { moto_number: 53, category: '50cc', pilot_1_name: 'Guillaume Perrin', pilot_1_sex: 'M', pilot_2_name: 'Fabien Mathieu', pilot_2_sex: 'M' },
  { moto_number: 54, category: '50cc', pilot_1_name: 'Vincent Barbier', pilot_1_sex: 'M', pilot_2_name: 'Olivier Brunet', pilot_2_sex: 'M' },
  { moto_number: 71, category: '70cc', pilot_1_name: 'Sébastien Brun', pilot_1_sex: 'M', pilot_2_name: 'Pascal Dumas', pilot_2_sex: 'M' },
  { moto_number: 72, category: '70cc', pilot_1_name: 'Coralie Lamy', pilot_1_sex: 'F', pilot_2_name: 'David Lefebvre', pilot_2_sex: 'M' },
  { moto_number: 73, category: '70cc', pilot_1_name: 'Mickaël Gautier', pilot_1_sex: 'M', pilot_2_name: 'Yannick Morin', pilot_2_sex: 'M' },
  { moto_number: 74, category: '70cc', pilot_1_name: 'Cédric Roger', pilot_1_sex: 'M', pilot_2_name: 'Arnaud Leroy', pilot_2_sex: 'M' }
]

export default function RaceSetup({ event, session, isAdmin, onStartRace, onClose }) {
  const [raceSession, setRaceSession] = useState(null)
  const [teams, setTeams] = useState([])

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [newCategory, setNewCategory] = useState('')
  const [previousSessions, setPreviousSessions] = useState([])
  const [showImportModal, setShowImportModal] = useState(false)

  const [laps, setLaps] = useState([])
  const [activeReviewTab, setActiveReviewTab] = useState('results')
  const [newLapForm, setNewLapForm] = useState({ moto_number: '', hours: '', minutes: '', seconds: '', milliseconds: '' })
  const [anomalies, setAnomalies] = useState([])
  const [hasCheckedAnomalies, setHasCheckedAnomalies] = useState(false)

  // Team form
  const [teamForm, setTeamForm] = useState({
    moto_number: '',
    category: DEFAULT_CATEGORIES[0],
    pilot_1_name: '', pilot_1_sex: 'M',
    pilot_2_name: '', pilot_2_sex: 'M',
    pilot_3_name: '', pilot_3_sex: 'M',
  })
  const [editingTeam, setEditingTeam] = useState(null)

  const loadSession = async () => {
    // Check if a race session already exists for this event
    const { data: sessions } = await supabase
      .from('race_sessions')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (sessions && sessions.length > 0) {
      const s = sessions[0]
      setRaceSession(s)
      setCategories(s.categories || DEFAULT_CATEGORIES)
      // Load teams for this session
      const { data: teamsData } = await supabase
        .from('race_teams')
        .select('*')
        .eq('session_id', s.id)
        .order('moto_number', { ascending: true })
      setTeams(teamsData || [])

      if (s.status === 'finished' || s.status === 'published') {
        const { data: lapsData } = await supabase
          .from('race_laps')
          .select('*')
          .eq('session_id', s.id)
          .order('recorded_at', { ascending: false })
        setLaps(lapsData || [])
      }
    }
  }

  const loadPreviousSessions = async () => {
    const { data } = await supabase
      .from('race_sessions')
      .select('*, race_teams(*)')
      .neq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setPreviousSessions(data || [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSession()
    loadPreviousSessions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  const handleCreateSession = async () => {
    const { data, error } = await supabase.from('race_sessions').insert([{
      event_id: event.id,
      name: `Course - ${event.title}`,
      categories,
      created_by: session.user.id,
      status: 'setup'
    }]).select().single()

    if (error) { alert('Erreur: ' + error.message); return }
    setRaceSession(data)

    // Also mark the event as having a race
    await supabase.from('events').update({ has_race: true }).eq('id', event.id)
  }

  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      const updated = [...categories, newCategory.trim()]
      setCategories(updated)
      setNewCategory('')
      if (raceSession) {
        supabase.from('race_sessions').update({ categories: updated }).eq('id', raceSession.id)
      }
    }
  }

  const handleRemoveCategory = (cat) => {
    const updated = categories.filter(c => c !== cat)
    setCategories(updated)
    if (raceSession) {
      supabase.from('race_sessions').update({ categories: updated }).eq('id', raceSession.id)
    }
  }

  const handleTeamSubmit = async (e) => {
    e.preventDefault()
    if (!raceSession) return

    const payload = {
      session_id: raceSession.id,
      moto_number: parseInt(teamForm.moto_number),
      category: teamForm.category,
      pilot_1_name: teamForm.pilot_1_name,
      pilot_1_sex: teamForm.pilot_1_sex,
      pilot_2_name: teamForm.pilot_2_name || null,
      pilot_2_sex: teamForm.pilot_2_name ? teamForm.pilot_2_sex : null,
      pilot_3_name: teamForm.pilot_3_name || null,
      pilot_3_sex: teamForm.pilot_3_name ? teamForm.pilot_3_sex : null,
    }

    if (editingTeam) {
      await supabase.from('race_teams').update(payload).eq('id', editingTeam.id)
    } else {
      await supabase.from('race_teams').insert([payload])
    }

    setTeamForm({
      moto_number: '', category: categories[0] || DEFAULT_CATEGORIES[0],
      pilot_1_name: '', pilot_1_sex: 'M',
      pilot_2_name: '', pilot_2_sex: 'M',
      pilot_3_name: '', pilot_3_sex: 'M',
    })
    setEditingTeam(null)
    loadSession()
  }

  const handleDeleteTeam = async (teamId) => {
    if (!confirm('Supprimer cette équipe ?')) return
    await supabase.from('race_teams').delete().eq('id', teamId)
    loadSession()
  }

  const handleEditTeam = (team) => {
    setEditingTeam(team)
    setTeamForm({
      moto_number: team.moto_number.toString(),
      category: team.category,
      pilot_1_name: team.pilot_1_name,
      pilot_1_sex: team.pilot_1_sex || 'M',
      pilot_2_name: team.pilot_2_name || '',
      pilot_2_sex: team.pilot_2_sex || 'M',
      pilot_3_name: team.pilot_3_name || '',
      pilot_3_sex: team.pilot_3_sex || 'M',
    })
  }

  const handleImportTeams = async (sourceSessionId) => {
    const source = previousSessions.find(s => s.id === sourceSessionId)
    if (!source || !source.race_teams) return

    const toImport = source.race_teams.map(t => ({
      session_id: raceSession.id,
      moto_number: t.moto_number,
      category: t.category,
      pilot_1_name: t.pilot_1_name,
      pilot_1_sex: t.pilot_1_sex,
      pilot_2_name: t.pilot_2_name,
      pilot_2_sex: t.pilot_2_sex,
      pilot_3_name: t.pilot_3_name,
      pilot_3_sex: t.pilot_3_sex,
    }))

    await supabase.from('race_teams').insert(toImport)
    setShowImportModal(false)
    loadSession()
  }

  const handleImportDemoTeams = async () => {
    if (!raceSession) return
    const toInsert = DEMO_TEAMS.map(t => ({
      session_id: raceSession.id,
      moto_number: t.moto_number,
      category: t.category,
      pilot_1_name: t.pilot_1_name,
      pilot_1_sex: t.pilot_1_sex,
      pilot_2_name: t.pilot_2_name,
      pilot_2_sex: t.pilot_2_sex,
    }))

    const { error } = await supabase.from('race_teams').insert(toInsert)
    if (error) {
      alert("Erreur lors de l'importation de la liste démo : " + error.message)
      return
    }
    loadSession()
  }

  const handleStartRace = async () => {
    if (teams.length === 0) {
      alert('Ajoutez au moins une équipe avant de lancer la course !')
      return
    }
    await supabase.from('race_sessions').update({
      status: 'live',
      started_at: null
    }).eq('id', raceSession.id)
    
    if (onStartRace) onStartRace({ ...raceSession, status: 'live', started_at: null }, teams)
  }

  const handleDeleteSession = async () => {
    if (!confirm('⚠️ Supprimer TOUTE la session (équipes + chronos) ? Cette action est irréversible !')) return
    await supabase.from('race_sessions').delete().eq('id', raceSession.id)
    await supabase.from('events').update({ has_race: false }).eq('id', event.id)
    setRaceSession(null)
    setTeams([])
  }

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
        if (b.totalLaps !== a.totalLaps) {
          return b.totalLaps - a.totalLaps
        }
        return a.lastPassageTime - b.lastPassageTime
      })

    return sorted.map((r, index) => {
      if (index === 0) {
        return { ...r, gapToLeader: 'LEADER', interval: '-' }
      }
      const leader = sorted[0]
      const prev = sorted[index - 1]
      
      let gapToLeader;
      if (r.totalLaps === leader.totalLaps) {
        gapToLeader = `+${((r.lastPassageTime - leader.lastPassageTime) / 1000).toFixed(3)}s`
      } else {
        const lapsDown = leader.totalLaps - r.totalLaps
        gapToLeader = `+${lapsDown} ${lapsDown === 1 ? 'Tour' : 'Tours'}`
      }

      let interval;
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

  const checkAnomalies = () => {
    const foundAnomalies = []
    
    // Check for double scans < 30 seconds
    const teamsLapsMap = {}
    laps.forEach(lap => {
      if (!teamsLapsMap[lap.team_id]) teamsLapsMap[lap.team_id] = []
      teamsLapsMap[lap.team_id].push(lap)
    })

    Object.keys(teamsLapsMap).forEach(teamId => {
      const teamLaps = teamsLapsMap[teamId].sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const team = teams.find(t => t.id === teamId)
      for (let i = 1; i < teamLaps.length; i++) {
        const diff = teamLaps[i].lap_time_ms - teamLaps[i - 1].lap_time_ms
        if (diff < 30000) {
          foundAnomalies.push({
            id: `dup-${teamLaps[i].id}`,
            message: `Moto #${team?.moto_number} : 2 passages très proches (${(diff/1000).toFixed(1)}s) au Tour ${teamLaps[i].lap_number}.`
          })
        }
      }
    })

    setAnomalies(foundAnomalies)
    setHasCheckedAnomalies(true)
  }

  const handleDeleteLap = async (lapId) => {
    if (!confirm('Supprimer ce passage ?')) return
    const { error } = await supabase.from('race_laps').delete().eq('id', lapId)
    if (error) {
      alert("Erreur lors de la suppression : " + error.message)
      return
    }
    loadSession()
  }

  const handleAddManualLap = async (e) => {
    e.preventDefault()
    const motoNum = parseInt(newLapForm.moto_number)
    if (!motoNum) return

    const team = teams.find(t => t.moto_number === motoNum)
    if (!team) {
      alert(`Moto #${motoNum} non trouvée dans la liste des équipes !`)
      return
    }

    const hrs = parseInt(newLapForm.hours || 0)
    const min = parseInt(newLapForm.minutes || 0)
    const sec = parseInt(newLapForm.seconds || 0)
    const ms = parseInt(newLapForm.milliseconds || 0)
    const totalMs = (hrs * 3600 + min * 60 + sec) * 1000 + ms
    if (totalMs <= 0) {
      alert("Le temps du tour doit être supérieur à 0 !")
      return
    }

    const teamLaps = laps.filter(l => l.team_id === team.id)
    const nextLapNum = teamLaps.length + 1

    const { error } = await supabase.from('race_laps').insert([{
      client_id: crypto.randomUUID(),
      session_id: raceSession.id,
      team_id: team.id,
      moto_number: motoNum,
      lap_time_ms: totalMs,
      lap_number: nextLapNum,
      recorded_by: session.user.id,
      recorded_at: new Date().toISOString()
    }])

    if (error) {
      alert("Erreur lors de l'enregistrement du tour : " + error.message)
      return
    }

    setNewLapForm({ moto_number: '', hours: '', minutes: '', seconds: '', milliseconds: '' })
    loadSession()
  }

  const handlePublishResults = async () => {
    if (!confirm('🏆 Valider et publier les résultats officiels de cette course ?')) return
    try {
      const { data, error } = await supabase.from('race_sessions').update({
        status: 'published'
      }).eq('id', raceSession.id).select()

      if (error) throw error
      if (!data || data.length === 0) throw new Error("La session n'a pas pu être mise à jour.")

      alert("Résultats officiels publiés avec succès !")
      setRaceSession(data[0])
    } catch (err) {
      alert("Erreur lors de la publication : " + err.message)
    }
  }

  const handleUnpublishResults = async () => {
    if (!confirm('🔓 Dépublier les résultats ? La session repassera en cours de modification.')) return
    try {
      const { data, error } = await supabase.from('race_sessions').update({
        status: 'finished'
      }).eq('id', raceSession.id).select()

      if (error) throw error
      if (!data || data.length === 0) throw new Error("La session n'a pas pu être mise à jour.")

      alert("Résultats dépubliés. La course est de nouveau modifiable.")
      setRaceSession(data[0])
    } catch (err) {
      alert("Erreur lors de la dépublication : " + err.message)
    }
  }

  const isPublished = raceSession?.status === 'published'
  const canModify = raceSession && (raceSession.status !== 'published' || isAdmin)

  if (raceSession && (raceSession.status === 'finished' || raceSession.status === 'published')) {
    const femaleWinner = getFemaleWinner()
    const femaleNames = []
    if (femaleWinner) {
      if (femaleWinner.pilot_1_sex === 'F') femaleNames.push(femaleWinner.pilot_1_name)
      if (femaleWinner.pilot_2_sex === 'F') femaleNames.push(femaleWinner.pilot_2_name)
      if (femaleWinner.pilot_3_sex === 'F') femaleNames.push(femaleWinner.pilot_3_name)
    }

    return (
      <div className="race-setup">
        <div className="race-setup-header">
          <div>
            <h2>🏆 Revue des Résultats</h2>
            <p className="race-setup-event-name">{event.title} — {new Date(event.date).toLocaleDateString('fr-FR')}</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>← Retour</button>
        </div>

        {/* Publication Status Banner */}
        <div className={`race-status-bar glass status-${raceSession.status}`}>
          <span className="race-status-indicator">
            {isPublished ? '📢 Résultats Officiels Publiés' : '🏁 Course Terminée — En attente de validation'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isPublished ? (
              <button className="btn btn-primary btn-sm" onClick={handlePublishResults} style={{ background: 'linear-gradient(135deg, #00cc66 0%, #009944 100%)', border: 'none' }}>
                🏆 Publier les Résultats
              </button>
            ) : (
              isAdmin && (
                <button className="btn btn-outline btn-sm" style={{ borderColor: '#ff4444', color: '#ff4444' }} onClick={handleUnpublishResults}>
                  🔓 Dépublier (Admin)
                </button>
              )
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="review-tabs">
          <button 
            className={`review-tab-btn ${activeReviewTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveReviewTab('results')}
          >
            🏆 Podiums & Classements
          </button>
          <button 
            className={`review-tab-btn ${activeReviewTab === 'laps' ? 'active' : ''}`}
            onClick={() => setActiveReviewTab('laps')}
          >
            ⏱️ Gestion des Passages ({laps.length})
          </button>
          <button 
            className={`review-tab-btn ${activeReviewTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveReviewTab('teams')}
          >
            🏍️ Équipes ({teams.length})
          </button>
        </div>

        {/* Tab Contents */}
        {activeReviewTab === 'results' && (
          <div className="review-tab-content fade-in">
            {/* Gagnante Féminine Overall */}
            {femaleWinner && (
              <div className="female-winner-card glass">
                <div className="female-winner-header">
                  <span className="female-crown-badge">👑 Coupe Féminine</span>
                  <h4>Gagnante Féminine Toute Catégorie</h4>
                </div>
                <div className="female-winner-body">
                  <div className="female-winner-trophy">🏆</div>
                  <div className="female-winner-details">
                    <span className="female-pilot-name">{femaleNames.join(' & ')}</span>
                    <span className="female-pilot-team">Moto #{femaleWinner.moto_number} — {femaleWinner.category}</span>
                    <span className="female-pilot-stats">{femaleWinner.totalLaps} Tours complets — Meilleur tour : {formatTime(femaleWinner.bestLap)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Podiums by category */}
            <div className="review-podiums-grid">
              {categories.map(cat => {
                const catRankings = getRankings(cat)
                if (catRankings.length === 0) return null
                return (
                  <div key={cat} className="review-podium-card glass">
                    <h3 className="review-podium-cat">{cat}</h3>
                    <div className="review-podium-visual">
                      {/* 2nd place */}
                      {catRankings[1] && (
                        <div className="review-podium-step step-2">
                          <div className="review-podium-avatar">🥈</div>
                          <span className="review-podium-name">{catRankings[1].pilot_1_name}</span>
                          <span className="review-podium-chrono">{catRankings[1].totalLaps} Tours</span>
                          <span className="review-podium-best">Min: {formatTime(catRankings[1].bestLap)}</span>
                          <div className="review-podium-block silver">2</div>
                        </div>
                      )}
                      {/* 1st place */}
                      {catRankings[0] && (
                        <div className="review-podium-step step-1">
                          <div className="review-podium-avatar">🥇</div>
                          <span className="review-podium-name">{catRankings[0].pilot_1_name}</span>
                          <span className="review-podium-chrono">{catRankings[0].totalLaps} Tours</span>
                          <span className="review-podium-best">Min: {formatTime(catRankings[0].bestLap)}</span>
                          <div className="review-podium-block gold">1</div>
                        </div>
                      )}
                      {/* 3rd place */}
                      {catRankings[2] && (
                        <div className="review-podium-step step-3">
                          <div className="review-podium-avatar">🥉</div>
                          <span className="review-podium-name">{catRankings[2].pilot_1_name}</span>
                          <span className="review-podium-chrono">{catRankings[2].totalLaps} Tours</span>
                          <span className="review-podium-best">Min: {formatTime(catRankings[2].bestLap)}</span>
                          <div className="review-podium-block bronze">3</div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Complete Rankings list */}
            {categories.map(cat => {
              const catRankings = getRankings(cat)
              if (catRankings.length === 0) return null
              return (
                <div key={cat} className="review-cat-section glass" style={{ marginTop: '20px', padding: '20px' }}>
                  <h3 style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '15px' }}>🏆 Classement {cat}</h3>
                  <table className="chrono-rankings-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>N°</th>
                        <th>Pilote(s)</th>
                        <th>Tours</th>
                        <th>Meilleur Tour</th>
                        <th>Écart Leader</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catRankings.map((r, i) => (
                        <tr key={r.id}>
                          <td>{i + 1}</td>
                          <td>#{r.moto_number}</td>
                          <td>
                            <div>{r.pilot_1_name}</div>
                            {r.pilot_2_name && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.pilot_2_name}</div>}
                          </td>
                          <td>{r.totalLaps}</td>
                          <td>{formatTime(r.bestLap)}</td>
                          <td>{r.gapToLeader}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        {/* Tab 2: Laps management */}
        {activeReviewTab === 'laps' && (
          <div className="review-tab-content fade-in">
            {/* Add Lap manually if allowed */}
            {canModify ? (
              <form onSubmit={handleAddManualLap} className="manual-lap-form glass" style={{ marginBottom: '20px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0' }}>➕ Ajouter un passage manuellement (Temps Cumulé)</h4>
                <div className="race-form-row">
                  <div className="race-form-group" style={{ width: '60px', flex: 'none' }}>
                    <label>Moto #</label>
                    <input 
                      type="number"
                      value={newLapForm.moto_number}
                      onChange={e => setNewLapForm({ ...newLapForm, moto_number: e.target.value })}
                      placeholder="N°"
                      required
                    />
                  </div>
                  <div className="race-form-group" style={{ width: '60px', flex: 'none' }}>
                    <label>Heures</label>
                    <input 
                      type="number"
                      value={newLapForm.hours}
                      onChange={e => setNewLapForm({ ...newLapForm, hours: e.target.value })}
                      placeholder="H"
                      min="0"
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 1 }}>
                    <label>Minutes</label>
                    <input 
                      type="number"
                      value={newLapForm.minutes}
                      onChange={e => setNewLapForm({ ...newLapForm, minutes: e.target.value })}
                      placeholder="Min"
                      min="0"
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 1 }}>
                    <label>Secondes</label>
                    <input 
                      type="number"
                      value={newLapForm.seconds}
                      onChange={e => setNewLapForm({ ...newLapForm, seconds: e.target.value })}
                      placeholder="Sec"
                      min="0"
                      max="59"
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 1 }}>
                    <label>Millisecondes</label>
                    <input 
                      type="number"
                      value={newLapForm.milliseconds}
                      onChange={e => setNewLapForm({ ...newLapForm, milliseconds: e.target.value })}
                      placeholder="Ms"
                      min="0"
                      max="999"
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>Enregistrer</button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="shop-disclaimer glass" style={{ marginBottom: '20px', padding: '15px' }}>
                🔒 Modification des passages verrouillée (résultats publiés).
              </div>
            )}

            {/* List of Laps */}
            <div className="laps-list-container glass" style={{ padding: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0' }}>⏱️ Historique de tous les passages ({laps.length})</h4>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table className="chrono-rankings-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Heure</th>
                      <th>Moto</th>
                      <th>Pilote</th>
                      <th>N° Tour</th>
                      <th>Temps Cumulé</th>
                      {canModify && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {laps.map(l => {
                      const team = teams.find(t => t.id === l.team_id)
                      return (
                        <tr key={l.id}>
                          <td>{new Date(l.recorded_at).toLocaleTimeString('fr-FR')}</td>
                          <td>#{l.moto_number}</td>
                          <td>{team?.pilot_1_name || '?'}</td>
                          <td>Tour {l.lap_number}</td>
                          <td>{formatTime(l.lap_time_ms)}</td>
                          {canModify && (
                            <td>
                              <button 
                                type="button"
                                onClick={() => handleDeleteLap(l.id)}
                                style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.1rem' }}
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {laps.length === 0 && (
                      <tr>
                        <td colSpan={canModify ? 6 : 5} style={{ textAlign: 'center', padding: '20px' }}>Aucun passage enregistré.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Anomalies Checker */}
            <div className="anomalies-checker glass" style={{ padding: '20px', marginTop: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0' }}>🕵️‍♂️ Assistant de Vérification</h4>
              <button type="button" onClick={checkAnomalies} className="btn btn-outline" style={{ marginBottom: '15px' }}>
                🔍 Lancer l'analyse des passages
              </button>
              
              {hasCheckedAnomalies && anomalies.length === 0 && (
                <div style={{ padding: '15px', background: 'rgba(0, 204, 102, 0.1)', color: '#00cc66', borderRadius: '8px', border: '1px solid rgba(0, 204, 102, 0.2)' }}>
                  ✅ Tout est OK ! Aucune anomalie détectée (aucun passage anormalement proche).
                </div>
              )}
              
              {hasCheckedAnomalies && anomalies.length > 0 && (
                <div style={{ padding: '15px', background: 'rgba(255, 170, 0, 0.1)', color: '#ffaa00', borderRadius: '8px', border: '1px solid rgba(255, 170, 0, 0.2)' }}>
                  <h5 style={{ margin: '0 0 10px 0' }}>⚠️ {anomalies.length} anomalie(s) potentielle(s) détectée(s) :</h5>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {anomalies.map(a => (
                      <li key={a.id} style={{ marginBottom: '5px' }}>{a.message}</li>
                    ))}
                  </ul>
                  <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Veuillez vérifier ces passages dans l'historique ci-dessus avant de publier les résultats.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 3: Teams list */}
        {activeReviewTab === 'teams' && (
          <div className="review-tab-content fade-in">
            {canModify ? (
              <form className="race-team-form glass" onSubmit={handleTeamSubmit}>
                <h3>{editingTeam ? '✏️ Modifier Équipe' : '➕ Ajouter une Équipe'}</h3>
                
                <div className="race-form-row">
                  <div className="race-form-group">
                    <label>N° Moto *</label>
                    <input
                      type="number"
                      min="1"
                      value={teamForm.moto_number}
                      onChange={e => setTeamForm({...teamForm, moto_number: e.target.value})}
                      placeholder="N°"
                      required
                      className="race-input-number"
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 2 }}>
                    <label>Catégorie *</label>
                    <select
                      value={teamForm.category}
                      onChange={e => setTeamForm({...teamForm, category: e.target.value})}
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Pilots */}
                {[1, 2, 3].map(n => (
                  <div key={n} className="race-form-row race-pilot-row">
                    <div className="race-form-group" style={{ flex: 3 }}>
                      <label>Pilote {n} {n === 1 ? '*' : '(optionnel)'}</label>
                      <input
                        type="text"
                        placeholder={`Nom du pilote ${n}`}
                        value={teamForm[`pilot_${n}_name`]}
                        onChange={e => setTeamForm({...teamForm, [`pilot_${n}_name`]: e.target.value})}
                        required={n === 1}
                      />
                    </div>
                    <div className="race-form-group" style={{ flex: 1 }}>
                      <label>Sexe</label>
                      <select
                        value={teamForm[`pilot_${n}_sex`]}
                        onChange={e => setTeamForm({...teamForm, [`pilot_${n}_sex`]: e.target.value})}
                      >
                        <option value="M">♂ Homme</option>
                        <option value="F">♀ Femme</option>
                      </select>
                    </div>
                  </div>
                ))}

                <div className="race-form-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingTeam ? '💾 Enregistrer' : '➕ Ajouter'}
                  </button>
                  {editingTeam && (
                    <button type="button" className="btn btn-ghost" onClick={() => {
                      setEditingTeam(null)
                      setTeamForm({ moto_number: '', category: categories[0] || DEFAULT_CATEGORIES[0], pilot_1_name: '', pilot_1_sex: 'M', pilot_2_name: '', pilot_2_sex: 'M', pilot_3_name: '', pilot_3_sex: 'M' })
                    }}>Annuler</button>
                  )}
                </div>
              </form>
            ) : (
              <div className="shop-disclaimer glass" style={{ marginBottom: '20px', padding: '15px' }}>
                🔒 Modification des équipes verrouillée (résultats publiés).
              </div>
            )}

            {/* Teams Grid */}
            <div className="race-teams-list">
              <h3>🏍️ Équipes Inscrites ({teams.length})</h3>
              {teams.length === 0 ? (
                <div className="race-empty">Aucune équipe inscrite.</div>
              ) : (
                <div className="race-teams-grid">
                  {teams.map(t => (
                    <div key={t.id} className="race-team-card glass">
                      <div className="race-team-number">#{t.moto_number}</div>
                      <div className="race-team-info">
                        <span className="race-team-category">{t.category}</span>
                        <div className="race-team-pilots">
                          <span>{t.pilot_1_sex === 'F' ? '♀' : '♂'} {t.pilot_1_name}</span>
                          {t.pilot_2_name && <span>{t.pilot_2_sex === 'F' ? '♀' : '♂'} {t.pilot_2_name}</span>}
                          {t.pilot_3_name && <span>{t.pilot_3_sex === 'F' ? '♀' : '♂'} {t.pilot_3_name}</span>}
                        </div>
                      </div>
                      {canModify && (
                        <div className="race-team-actions">
                          <button onClick={() => handleEditTeam(t)}>✏️</button>
                          <button onClick={() => handleDeleteTeam(t.id)}>🗑️</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delete session button is only visible to admin once published */}
        {(!isPublished || isAdmin) && (
          <div className="race-setup-actions glass" style={{ marginTop: '20px' }}>
            <button className="btn btn-ghost race-delete-btn" onClick={handleDeleteSession}>
              🗑️ Supprimer la session
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="race-setup">
      <div className="race-setup-header">
        <div>
          <h2>🏁 Configuration Course</h2>
          <p className="race-setup-event-name">{event.title} — {new Date(event.date).toLocaleDateString('fr-FR')}</p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>← Retour</button>
      </div>

      {!raceSession ? (
        /* ─── No Session Yet ─── */
        <div className="race-setup-create glass">
          <div className="race-setup-create-icon">🏁</div>
          <h3>Aucune course configurée</h3>
          <p>Créez une session de course pour cet événement</p>
          <button className="btn btn-primary" onClick={handleCreateSession}>
            ➕ Créer la Session de Course
          </button>
        </div>
      ) : (
        <>
          {/* ─── Session Status Bar ─── */}
          <div className={`race-status-bar glass status-${raceSession.status}`}>
            <span className="race-status-indicator">
              {raceSession.status === 'setup' && '⚙️ Configuration'}
              {raceSession.status === 'live' && '🔴 EN DIRECT'}
              {raceSession.status === 'finished' && '🏁 Terminée'}
              {raceSession.status === 'published' && '📢 Publiée'}
            </span>
            <span className="race-status-teams">{teams.length} équipe{teams.length > 1 ? 's' : ''} inscrite{teams.length > 1 ? 's' : ''}</span>
          </div>

          {/* ─── Primary Actions (top, near event header) ─── */}
          {raceSession.status === 'setup' && (
            <div className="race-primary-actions">
              <button className="btn btn-primary race-start-btn race-action-cta" onClick={handleStartRace}>
                ▶️ LANCER LA COURSE
              </button>
            </div>
          )}
          {raceSession.status === 'live' && (
            <>
              <div className="race-primary-actions race-primary-actions-live">
                <button
                  className="btn btn-primary race-action-cta race-action-chrono"
                  onClick={() => onStartRace(raceSession, teams)}
                >
                  ⏱️ ACCÉDER AU CHRONOMÉTRAGE
                </button>
              </div>

              {/* ─── Live Video Broadcasting (Organiser) ─── */}
              <LiveVideoBroadcaster 
                session={session} 
                raceSession={raceSession} 
              />
            </>
          )}

          {/* ─── Categories Manager ─── */}
          <div className="race-categories glass">
            <h3>📋 Catégories</h3>
            <div className="race-cat-list">
              {categories.map(cat => (
                <span key={cat} className="race-cat-tag">
                  {cat}
                  <button className="race-cat-remove" onClick={() => handleRemoveCategory(cat)}>×</button>
                </span>
              ))}
            </div>
            <div className="race-cat-add">
              <input 
                type="text" 
                placeholder="Nouvelle catégorie..."
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              />
              <button className="btn btn-sm btn-outline" onClick={handleAddCategory}>+</button>
            </div>
          </div>

          {/* ─── Team Form ─── */}
          <form className="race-team-form glass" onSubmit={handleTeamSubmit}>
            <h3>{editingTeam ? '✏️ Modifier Équipe' : '➕ Ajouter une Équipe'}</h3>
            
            <div className="race-form-row">
              <div className="race-form-group">
                <label>N° Moto *</label>
                <input
                  type="number"
                  min="1"
                  value={teamForm.moto_number}
                  onChange={e => setTeamForm({...teamForm, moto_number: e.target.value})}
                  placeholder="N°"
                  required
                  className="race-input-number"
                />
              </div>
              <div className="race-form-group" style={{ flex: 2 }}>
                <label>Catégorie *</label>
                <select
                  value={teamForm.category}
                  onChange={e => setTeamForm({...teamForm, category: e.target.value})}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Pilots */}
            {[1, 2, 3].map(n => (
              <div key={n} className="race-form-row race-pilot-row">
                <div className="race-form-group" style={{ flex: 3 }}>
                  <label>Pilote {n} {n === 1 ? '*' : '(optionnel)'}</label>
                  <input
                    type="text"
                    placeholder={`Nom du pilote ${n}`}
                    value={teamForm[`pilot_${n}_name`]}
                    onChange={e => setTeamForm({...teamForm, [`pilot_${n}_name`]: e.target.value})}
                    required={n === 1}
                  />
                </div>
                <div className="race-form-group" style={{ flex: 1 }}>
                  <label>Sexe</label>
                  <select
                    value={teamForm[`pilot_${n}_sex`]}
                    onChange={e => setTeamForm({...teamForm, [`pilot_${n}_sex`]: e.target.value})}
                  >
                    <option value="M">♂ Homme</option>
                    <option value="F">♀ Femme</option>
                  </select>
                </div>
              </div>
            ))}

            <div className="race-form-actions">
              <button type="submit" className="btn btn-primary">
                {editingTeam ? '💾 Enregistrer' : '➕ Ajouter'}
              </button>
              {editingTeam && (
                <button type="button" className="btn btn-ghost" onClick={() => {
                  setEditingTeam(null)
                  setTeamForm({ moto_number: '', category: categories[0], pilot_1_name: '', pilot_1_sex: 'M', pilot_2_name: '', pilot_2_sex: 'M', pilot_3_name: '', pilot_3_sex: 'M' })
                }}>Annuler</button>
              )}
            </div>
          </form>

          {/* ─── Import actions ─── */}
          {teams.length === 0 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', width: '100%' }}>
              {previousSessions.length > 0 && (
                <button 
                  type="button"
                  className="btn btn-outline" 
                  onClick={() => setShowImportModal(true)}
                  style={{ flex: 1, minWidth: '240px' }}
                >
                  📥 Importer depuis une session précédente ({previousSessions.length})
                </button>
              )}
            </div>
          )}

          {/* ─── Teams List ─── */}
          <div className="race-teams-list">
            <h3>🏍️ Équipes Inscrites ({teams.length})</h3>
            {teams.length === 0 ? (
              <div className="race-empty">Aucune équipe inscrite pour le moment.</div>
            ) : (
              <div className="race-teams-grid">
                {teams.map(t => (
                  <div key={t.id} className="race-team-card glass">
                    <div className="race-team-number">#{t.moto_number}</div>
                    <div className="race-team-info">
                      <span className="race-team-category">{t.category}</span>
                      <div className="race-team-pilots">
                        <span>{t.pilot_1_sex === 'F' ? '♀' : '♂'} {t.pilot_1_name}</span>
                        {t.pilot_2_name && <span>{t.pilot_2_sex === 'F' ? '♀' : '♂'} {t.pilot_2_name}</span>}
                        {t.pilot_3_name && <span>{t.pilot_3_sex === 'F' ? '♀' : '♂'} {t.pilot_3_name}</span>}
                      </div>
                    </div>
                    <div className="race-team-actions">
                      <button onClick={() => handleEditTeam(t)}>✏️</button>
                      <button onClick={() => handleDeleteTeam(t.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Bottom Action Buttons (secondary access + destructive) ─── */}
          <div className="race-setup-actions glass">
            {raceSession.status === 'live' && (
              <button
                className="btn btn-outline race-action-chrono-secondary"
                onClick={() => onStartRace(raceSession, teams)}
              >
                ⏱️ Chronométrage
              </button>
            )}
            <button className="btn btn-ghost race-delete-btn" onClick={handleDeleteSession}>
              🗑️ Supprimer la session
            </button>
          </div>

          {/* ─── Import Modal ─── */}
          {showImportModal && (
            <div className="race-import-overlay" onClick={() => setShowImportModal(false)}>
              <div className="race-import-modal glass" onClick={e => e.stopPropagation()}>
                <h3>📥 Importer des équipes</h3>
                <p className="race-import-desc">Sélectionnez une session précédente pour récupérer sa liste d'équipes :</p>
                <div className="race-import-list">
                  {previousSessions.filter(s => s.race_teams && s.race_teams.length > 0).map(s => (
                    <div key={s.id} className="race-import-item" onClick={() => handleImportTeams(s.id)}>
                      <div>
                        <strong>{s.name}</strong>
                        <span className="race-import-date">{new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <span className="race-import-count">{s.race_teams.length} équipe{s.race_teams.length > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>Annuler</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LiveVideoBroadcaster({ session, raceSession }) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  
  const videoRef = useRef(null)
  const clientRef = useRef(null)
  const trackRef = useRef(null)
  const audioTrackRef = useRef(null)

  // Auto clean-up on unmount
  useEffect(() => {
    return () => {
      if (trackRef.current) {
        trackRef.current.close()
      }
      if (audioTrackRef.current) {
        audioTrackRef.current.close()
      }
      if (clientRef.current) {
        clientRef.current.leave().catch(console.error)
      }
    }
  }, [])

  // Start playing the local video once the container is rendered
  useEffect(() => {
    if (isStreaming && videoRef.current && trackRef.current) {
      trackRef.current.play(videoRef.current, { fit: "contain" })
    }
  }, [isStreaming])

  const startStreaming = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      // 1. Concurrency Check: Check if someone else is already streaming
      const { data: latestSession, error: checkError } = await supabase
        .from('race_sessions')
        .select('live_stream_active, live_stream_user_id')
        .eq('id', raceSession.id)
        .single()

      if (checkError) throw checkError

      if (latestSession.live_stream_active && latestSession.live_stream_user_id !== session.user.id) {
        throw new Error("⚠️ Un live est déjà en cours de diffusion sur cette course par un autre organisateur.")
      }

      // 2. Initialize Agora Client
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" })
      clientRef.current = client
      
      const appId = import.meta.env.VITE_AGORA_APP_ID;
      if (!appId) throw new Error("VITE_AGORA_APP_ID est manquant dans la configuration.")
      
      const channelName = `live-stream-${raceSession.id}`;
      await client.join(appId, channelName, null, session.user.id)

      // 3. Create local video & audio tracks
      const videoTrack = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: {
          width: 2560,
          height: 1440,
          frameRate: 30,
          bitrateMin: 3000,
          bitrateMax: 7000
        },
        facingMode: "environment", // Try to use rear camera by default
        optimizationMode: "detail" // Prioritize image clarity/sharpness over framerate
      })
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      
      trackRef.current = videoTrack
      audioTrackRef.current = audioTrack
      
      // Enable Dual Stream for adaptive bitrate
      await client.enableDualStream()

      // 4. (Video preview is handled by the useEffect above once isStreaming=true renders the div)

      // 5. Publish to Agora
      await client.publish([videoTrack, audioTrack])

      // 6. Update DB
      await supabase.from('race_sessions').update({
        live_stream_active: true,
        live_stream_user_id: session.user.id
      }).eq('id', raceSession.id)

      setIsStreaming(true)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message)
      // Cleanup if failed
      if (trackRef.current) {
        trackRef.current.close()
        trackRef.current = null
      }
      if (audioTrackRef.current) {
        audioTrackRef.current.close()
        audioTrackRef.current = null
      }
      if (clientRef.current) {
        await clientRef.current.leave()
        clientRef.current = null
      }
    } finally {
      setLoading(false)
    }
  }

  const switchCamera = async () => {
    if (!trackRef.current) return;
    try {
      const cams = await AgoraRTC.getCameras();
      if (cams.length <= 1) return;
      const currentId = trackRef.current.getDeviceId ? trackRef.current.getDeviceId() : null;
      let nextCam;
      if (currentId) {
        const idx = cams.findIndex(c => c.deviceId === currentId);
        nextCam = cams[(idx + 1) % cams.length];
      } else {
        nextCam = cams[1]; // fallback to the second camera
      }
      if (nextCam) {
        await trackRef.current.setDevice(nextCam.deviceId);
      }
    } catch (e) {
      console.error("Camera switch failed", e);
    }
  }

  const toggleMute = () => {
    if (audioTrackRef.current) {
      const currentMuted = !isMuted;
      audioTrackRef.current.setMuted(currentMuted);
      setIsMuted(currentMuted);
    }
  }

  const stopStreaming = async () => {
    if (trackRef.current) {
      trackRef.current.close()
      trackRef.current = null
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.close()
      audioTrackRef.current = null
    }
    if (clientRef.current) {
      try {
        await clientRef.current.leave()
      } catch(e) {
        console.error("Agora leave error", e)
      }
      clientRef.current = null
    }

    // Update DB
    try {
      await supabase.from('race_sessions').update({
        live_stream_active: false,
        live_stream_user_id: null
      }).eq('id', raceSession.id)
    } catch (err) {
      console.error("Error clearing live lock:", err)
    }

    setIsStreaming(false)
  }

  return (
    <div className="race-setup-stream glass" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border-subtle)', marginBottom: '20px', background: 'rgba(255, 85, 0, 0.02)' }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
        🎥 Diffusion Vidéo en Direct
      </h3>
      
      {errorMsg && (
        <div style={{ padding: '12px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff4444', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '15px', lineHeight: '1.4' }}>
          {errorMsg}
        </div>
      )}

      {isStreaming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div 
              ref={videoRef} 
              style={{ width: '100%', height: '100%' }}
            />
            <span style={{ position: 'absolute', top: '10px', left: '10px', background: '#ff3b30', color: '#fff', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', zIndex: 10 }}>
              <span style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              DIFFUSION EN COURS
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-outline" 
              onClick={toggleMute}
              style={{ flex: '1 1 45%', padding: '8px', borderColor: isMuted ? '#ff4444' : '#fff', color: isMuted ? '#ff4444' : '#fff' }}
            >
              {isMuted ? '🔇 Micro Coupé' : '🎙️ Couper Micro'}
            </button>
            <button 
              className="btn btn-outline" 
              onClick={switchCamera}
              style={{ flex: '1 1 45%', padding: '8px', borderColor: '#fff', color: '#fff' }}
            >
              🔄 Caméra
            </button>
            <button 
              className="btn btn-outline" 
              onClick={stopStreaming}
              style={{ flex: '1 1 100%', padding: '8px', borderColor: '#ff4444', color: '#ff4444' }}
            >
              🛑 Arrêter le Live
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Partagez la course en direct depuis le bord de la piste ! Les spectateurs verront votre caméra s'afficher instantanément sur la page live.
          </p>
          <button 
            className="btn btn-primary" 
            onClick={startStreaming}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ff5500 0%, #ff8c42 100%)', border: 'none' }}
          >
            {loading ? 'Initialisation...' : '🎥 Lancer le Live Vidéo'}
          </button>
        </div>
      )}
    </div>
  )
}
