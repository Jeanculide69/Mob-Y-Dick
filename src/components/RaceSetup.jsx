import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
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

export default function RaceSetup({ event, session, onStartRace, onClose }) {
  const [raceSession, setRaceSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [newCategory, setNewCategory] = useState('')
  const [previousSessions, setPreviousSessions] = useState([])
  const [showImportModal, setShowImportModal] = useState(false)

  // Team form
  const [teamForm, setTeamForm] = useState({
    moto_number: '',
    category: DEFAULT_CATEGORIES[0],
    pilot_1_name: '', pilot_1_sex: 'M',
    pilot_2_name: '', pilot_2_sex: 'M',
    pilot_3_name: '', pilot_3_sex: 'M',
  })
  const [editingTeam, setEditingTeam] = useState(null)

  useEffect(() => {
    loadSession()
    loadPreviousSessions()
  }, [event])

  const loadSession = async () => {
    setLoading(true)
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
    }
    setLoading(false)
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
      started_at: new Date().toISOString()
    }).eq('id', raceSession.id)
    
    if (onStartRace) onStartRace({ ...raceSession, status: 'live' }, teams)
  }

  const handleDeleteSession = async () => {
    if (!confirm('⚠️ Supprimer TOUTE la session (équipes + chronos) ? Cette action est irréversible !')) return
    await supabase.from('race_sessions').delete().eq('id', raceSession.id)
    await supabase.from('events').update({ has_race: false }).eq('id', event.id)
    setRaceSession(null)
    setTeams([])
  }

  if (loading) return <div className="race-setup-loading">Chargement...</div>

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
              <button 
                type="button"
                className="btn btn-outline" 
                onClick={handleImportDemoTeams}
                style={{ flex: 1, minWidth: '240px', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(255, 85, 0, 0.05)', fontWeight: 'bold' }}
              >
                🚀 Importer la Liste Démo (20 équipes de test)
              </button>
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

          {/* ─── Live Video Broadcasting (Organiser) ─── */}
          {raceSession.status === 'live' && (
            <LiveVideoBroadcaster 
              session={session} 
              raceSession={raceSession} 
            />
          )}

          {/* ─── Action Buttons ─── */}
          <div className="race-setup-actions glass">
            {raceSession.status === 'setup' ? (
              <button className="btn btn-primary btn-lg race-start-btn" onClick={handleStartRace}>
                ▶️ LANCER LA COURSE
              </button>
            ) : raceSession.status === 'live' ? (
              <button className="btn btn-primary btn-lg race-start-btn" onClick={() => onStartRace(raceSession, teams)} style={{ background: 'linear-gradient(135deg, #00cc66 0%, #009944 100%)' }}>
                ⏱️ ACCÉDER AU CHRONOMÉTRAGE
              </button>
            ) : null}
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
  
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const channelRef = useRef(null)

  // Auto clean-up on unmount
  useEffect(() => {
    return () => {
      // Clear capture loop
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      // Stop camera track
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

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

      // 2. Request camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false
      })

      streamRef.current = stream
      // Small timeout to allow video tag to mount and be ready
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 100)

      // 3. Update DB
      await supabase.from('race_sessions').update({
        live_stream_active: true,
        live_stream_user_id: session.user.id
      }).eq('id', raceSession.id)

      // 4. Initialize Signaling / Frame Channel
      const channel = supabase.channel(`live-stream-${raceSession.id}`)
      channelRef.current = channel
      channel.subscribe()

      // 5. Canvas capture interval (every 250ms -> ~4fps, extremely fast and light!)
      const canvas = document.createElement('canvas')
      canvas.width = 480
      canvas.height = 270
      const ctx = canvas.getContext('2d')

      intervalRef.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState === 4) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
          const base64Frame = canvas.toDataURL('image/jpeg', 0.5) // high compression for low payload!
          
          channel.send({
            type: 'broadcast',
            event: 'video-frame',
            payload: { image: base64Frame }
          })
        }
      }, 250)

      setIsStreaming(true)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const stopStreaming = async () => {
    // Clear capture loop
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Stop camera track
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Clean channels
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
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
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <span style={{ position: 'absolute', top: '10px', left: '10px', background: '#ff3b30', color: '#fff', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', zIndex: 10 }}>
              <span style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              DIFFUSION EN COURS
            </span>
          </div>
          <button 
            className="btn btn-outline" 
            onClick={stopStreaming}
            style={{ borderColor: '#ff4444', color: '#ff4444', width: 'fit-content' }}
          >
            🛑 Arrêter le Live Vidéo
          </button>
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

