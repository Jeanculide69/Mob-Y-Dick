import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { generateGeminiContent } from '../utils/geminiApi'
import { fetchAllRows } from '../utils/fetchAllRows'
import './RaceSetup.css'

const DEFAULT_CATEGORIES = ['Cadre en V serie A 50cc', 'Cadre en V serie B 70cc', 'Scoopette', 'Cadre tubulaire', 'Proto']

export default function RaceSetup({ event, session, isAdmin, profile, onStartRace, onClose }) {
  const isRaceManager = isAdmin || profile?.role === 'organisateur'
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

  // Lap editing and smoothing states
  const [editingLapId, setEditingLapId] = useState(null)
  const [editingLapForm, setEditingLapForm] = useState({ hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
  const [smoothingTeamId, setSmoothingTeamId] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('myd_gemini_api_key') || '')
  const [aiModelActive, setAiModelActive] = useState(false)
  const [aiResponse, setAiResponse] = useState(null)
  const [aiError, setAiError] = useState('')
  const [customSmoothRange, setCustomSmoothRange] = useState({ start: '', end: '' })
  const [lastLapsBackup, setLastLapsBackup] = useState(null)

  // Durée prévue de la course (en minutes) — saisie locale, persistée sur blur
  const [durationInput, setDurationInput] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDurationInput(raceSession?.duration_minutes != null ? String(raceSession.duration_minutes) : '')
  }, [raceSession?.duration_minutes])


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
        // ⚠️ fetchAllRows obligatoire : Supabase coupe toute réponse à 1000
        // lignes et une course dépasse déjà ce seuil (>1000 passages). Avec une
        // liste tronquée, la détection d'anomalies invente des tours manquants,
        // le plan de correction IA travaille sur des données partielles, et
        // surtout l'annulation du lissage supprime les passages absents de la
        // sauvegarde — donc de vrais tours.
        let lapsData = []
        try {
          lapsData = await fetchAllRows(() => supabase
            .from('race_laps')
            .select('*')
            .eq('session_id', s.id)
            .order('recorded_at', { ascending: false })
            .order('id', { ascending: true }))
        } catch (err) {
          console.error('Chargement des tours échoué:', err)
        }
        setLaps(lapsData)
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

  const handleSaveDuration = async () => {
    if (!raceSession) return
    const trimmed = (durationInput || '').trim()
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10)
    if (trimmed !== '' && (!Number.isFinite(parsed) || parsed <= 0)) {
      alert('Durée invalide. Entrez un nombre de minutes positif ou laissez vide.')
      setDurationInput(raceSession?.duration_minutes != null ? String(raceSession.duration_minutes) : '')
      return
    }
    if (parsed === (raceSession.duration_minutes ?? null)) return
    const { error } = await supabase
      .from('race_sessions')
      .update({ duration_minutes: parsed })
      .eq('id', raceSession.id)
    if (error) {
      alert('Erreur enregistrement durée : ' + error.message)
      return
    }
    setRaceSession(prev => prev ? { ...prev, duration_minutes: parsed } : prev)
  }

  const handleTeamSubmit = async (e) => {
    e.preventDefault()
    if (!raceSession) {
      alert("Aucune session de course créée. Cliquez d'abord sur \"Créer la session\".")
      return
    }

    const motoNum = parseInt(teamForm.moto_number)
    if (!motoNum || isNaN(motoNum)) {
      alert("Numéro de moto invalide.")
      return
    }
    if (!teamForm.pilot_1_name?.trim()) {
      alert("Le nom du pilote 1 est obligatoire.")
      return
    }

    const payload = {
      session_id: raceSession.id,
      moto_number: motoNum,
      category: teamForm.category,
      pilot_1_name: teamForm.pilot_1_name.trim(),
      pilot_1_sex: teamForm.pilot_1_sex,
      pilot_2_name: teamForm.pilot_2_name?.trim() || null,
      pilot_2_sex: teamForm.pilot_2_name?.trim() ? teamForm.pilot_2_sex : null,
      pilot_3_name: teamForm.pilot_3_name?.trim() || null,
      pilot_3_sex: teamForm.pilot_3_name?.trim() ? teamForm.pilot_3_sex : null,
    }

    const { error } = editingTeam
      ? await supabase.from('race_teams').update(payload).eq('id', editingTeam.id)
      : await supabase.from('race_teams').insert([payload])

    if (error) {
      console.error('race_teams insert/update error:', error)
      alert(`Erreur lors de l'enregistrement de l'équipe : ${error.message}`)
      return
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

  const handleUpdatePenalty = async (teamId, newPenalty) => {
    const { error } = await supabase.from('race_teams').update({ penalty_laps: newPenalty }).eq('id', teamId)
    if (error) alert('Erreur mise à jour pénalité: ' + error.message)
    else loadSession()
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

  const handleCancelRace = async () => {
    const hasStarted = !!raceSession.started_at
    const warn = hasStarted
      ? '↩️ Annuler la course en cours et revenir à la configuration ?\n\n⚠️ Le chrono a déjà démarré. Les passages enregistrés ne sont PAS supprimés (ils restent rattachés à la session si tu relances).'
      : '↩️ Annuler le lancement et revenir à la configuration ?\n\nLe bouton LIVE disparaîtra côté spectateurs.'
    if (!confirm(warn)) return
    const { error } = await supabase.from('race_sessions').update({
      status: 'setup',
      started_at: null
    }).eq('id', raceSession.id)
    if (error) {
      alert('Erreur : ' + error.message)
      return
    }
    setRaceSession(prev => ({ ...prev, status: 'setup', started_at: null }))
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
      const actualLapsCount = teamLaps.length
      const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
      
      let bestLap = null
      let lastLap = null
      let avgLap = null
      
      if (actualLapsCount > 0) {
        const durations = teamLaps.map((lap, idx) => {
          if (idx === 0) return lap.lap_time_ms
          return lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
        })
        bestLap = Math.min(...durations)
        lastLap = durations[actualLapsCount - 1]
        avgLap = Math.round(teamLaps[actualLapsCount - 1].lap_time_ms / actualLapsCount)
      }

      return { 
        ...team, 
        bestLap, 
        avgLap, 
        lastLap, 
        totalLaps, 
        laps: teamLaps,
        lastPassageTime: actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
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
      const actualLapsCount = teamLaps.length
      const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
      
      let bestLap = null
      if (actualLapsCount > 0) {
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
        lastPassageTime: actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
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

  const getJuniorWinner = () => {
    const juniorTeams = teams.filter(t => 
      t.pilot_1_sex === 'J' || 
      t.pilot_2_sex === 'J' || 
      t.pilot_3_sex === 'J'
    )
    if (juniorTeams.length === 0) return null

    const rankedJunior = juniorTeams.map(team => {
      const teamLaps = laps.filter(l => l.team_id === team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const actualLapsCount = teamLaps.length
      const totalLaps = Math.max(0, actualLapsCount - (team.penalty_laps || 0))
      
      let bestLap = null
      if (actualLapsCount > 0) {
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
        lastPassageTime: actualLapsCount > 0 ? teamLaps[actualLapsCount - 1].lap_time_ms : Infinity
      }
    }).filter(t => t.totalLaps > 0)
      .sort((a, b) => {
        if (b.totalLaps !== a.totalLaps) {
          return b.totalLaps - a.totalLaps
        }
        return a.lastPassageTime - b.lastPassageTime
      })

    return rankedJunior[0] || null
  }

  const checkAnomalies = () => {
    const foundAnomalies = []
    
    // Check for double scans < 30 seconds and abnormally short laps
    const teamsLapsMap = {}
    laps.forEach(lap => {
      if (!teamsLapsMap[lap.team_id]) teamsLapsMap[lap.team_id] = []
      teamsLapsMap[lap.team_id].push(lap)
    })

    const getMedianVal = (values) => {
      if (values.length === 0) return 0
      const sorted = [...values].sort((a, b) => a - b)
      const half = Math.floor(sorted.length / 2)
      return sorted.length % 2 !== 0 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
    }

    Object.keys(teamsLapsMap).forEach(teamId => {
      const teamLaps = teamsLapsMap[teamId].sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const team = teams.find(t => t.id === teamId)
      if (!team) return

      const durations = teamLaps.map((lap, idx) => {
        if (idx === 0) return lap.lap_time_ms
        return lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
      })

      const median = getMedianVal(durations)
      const shortThreshold = Math.max(30000, median * 0.65) // 65% of median or 30s minimum

      for (let i = 1; i < teamLaps.length; i++) {
        const diff = teamLaps[i].lap_time_ms - teamLaps[i - 1].lap_time_ms
        if (diff < 30000) {
          foundAnomalies.push({
            id: `dup-${teamLaps[i].id}`,
            teamId,
            message: `Moto #${team.moto_number} : 2 passages très proches (${(diff/1000).toFixed(1)}s) au Tour ${teamLaps[i].lap_number}.`
          })
        } else if (diff < shortThreshold && teamLaps.length >= 3) {
          foundAnomalies.push({
            id: `short-${teamLaps[i].id}`,
            teamId,
            message: `Moto #${team.moto_number} : Tour ${teamLaps[i].lap_number} anormalement court (${formatTime(diff)} vs médiane ${formatTime(median)}).`
          })
        }
      }
    })

    setAnomalies(foundAnomalies)
    setHasCheckedAnomalies(true)
  }

  const resequenceLapNumbers = async (teamId) => {
    const { data: teamLaps, error } = await supabase
      .from('race_laps')
      .select('id, lap_number, lap_time_ms')
      .eq('team_id', teamId)
      .order('lap_time_ms', { ascending: true })

    if (error || !teamLaps) return

    const updates = []
    for (let i = 0; i < teamLaps.length; i++) {
      const expectedNum = i + 1
      if (teamLaps[i].lap_number !== expectedNum) {
        updates.push(
          supabase
            .from('race_laps')
            .update({ lap_number: expectedNum })
            .eq('id', teamLaps[i].id)
        )
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }
  }

  const handleDeleteLap = async (lapId) => {
    if (!confirm('Supprimer ce passage ?')) return
    const lapToDelete = laps.find(l => l.id === lapId)
    if (!lapToDelete) return
    const teamId = lapToDelete.team_id

    // Backup before delete
    const teamLapsToBackup = laps.filter(l => l.team_id === teamId).map(l => ({ ...l }))
    setLastLapsBackup({ teamId, laps: teamLapsToBackup })

    const { error } = await supabase.from('race_laps').delete().eq('id', lapId)
    if (error) {
      alert("Erreur lors de la suppression : " + error.message)
      return
    }
    await resequenceLapNumbers(teamId)
    loadSession()
  }

  const startEditingLap = (lap) => {
    setEditingLapId(lap.id)
    const ms = lap.lap_time_ms
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const milliseconds = ms % 1000
    setEditingLapForm({ hours, minutes, seconds, milliseconds })
  }

  const saveEditingLap = async (lapId) => {
    const lapToUpdate = laps.find(l => l.id === lapId)
    if (!lapToUpdate) return
    const teamId = lapToUpdate.team_id

    const { hours, minutes, seconds, milliseconds } = editingLapForm
    const newTimeMs = (parseInt(hours || 0) * 3600 + parseInt(minutes || 0) * 60 + parseInt(seconds || 0)) * 1000 + parseInt(milliseconds || 0)
    
    if (newTimeMs <= 0) {
      alert("Le temps du tour doit être supérieur à 0 !")
      return
    }

    // Backup before update
    const teamLapsToBackup = laps.filter(l => l.team_id === teamId).map(l => ({ ...l }))
    setLastLapsBackup({ teamId, laps: teamLapsToBackup })

    const { error } = await supabase
      .from('race_laps')
      .update({ lap_time_ms: newTimeMs })
      .eq('id', lapId)

    if (error) {
      alert("Erreur lors de la modification : " + error.message)
      return
    }

    setEditingLapId(null)
    await resequenceLapNumbers(teamId)
    loadSession()
  }

  const getMedian = (values) => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const half = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
  }

  const getTeamAnomaliesAndGroups = (teamId) => {
    const teamLaps = laps.filter(l => l.team_id === teamId).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
    if (teamLaps.length === 0) return { anomalies: [], groups: [], median: 0 }

    const durations = teamLaps.map((lap, idx) => {
      if (idx === 0) return lap.lap_time_ms
      return lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
    })

    const median = getMedian(durations)
    const threshold = Math.max(30000, median * 0.65)

    const teamAnomalies = []
    const anomalousIndices = new Set()

    durations.forEach((d, idx) => {
      if (idx > 0 && d < 30000) {
        teamAnomalies.push({
          index: idx,
          lap: teamLaps[idx],
          type: 'double_scan',
          message: `Passage double (${(d/1000).toFixed(1)}s)`
        })
        anomalousIndices.add(idx)
      } else if (d < threshold) {
        teamAnomalies.push({
          index: idx,
          lap: teamLaps[idx],
          type: 'too_short',
          message: `Tour trop court (${formatTime(d)})`
        })
        anomalousIndices.add(idx)
      }
    })

    const groups = []
    let currentGroup = null

    teamLaps.forEach((lap, idx) => {
      if (anomalousIndices.has(idx)) {
        if (!currentGroup) {
          const startIndex = Math.max(0, idx - 1)
          currentGroup = {
            startIndex,
            endIndex: idx,
            anomalousIndices: [idx]
          }
        } else {
          currentGroup.endIndex = idx
          currentGroup.anomalousIndices.push(idx)
        }
      } else {
        if (currentGroup) {
          currentGroup.endIndex = idx
          groups.push(currentGroup)
          currentGroup = null
        }
      }
    })
    if (currentGroup) {
      currentGroup.endIndex = teamLaps.length - 1
      groups.push(currentGroup)
    }

    const formattedGroups = groups.map(g => {
      const startLap = teamLaps[g.startIndex]
      const endLap = teamLaps[g.endIndex]
      const baseTime = g.startIndex === 0 ? 0 : teamLaps[g.startIndex - 1].lap_time_ms
      const totalTime = endLap.lap_time_ms - baseTime
      const numLaps = g.endIndex - g.startIndex + (g.startIndex === 0 ? 1 : 0)
      const expectedLaps = Math.round(totalTime / median)

      return {
        startIndex: g.startIndex,
        endIndex: g.endIndex,
        anomalousIndices: g.anomalousIndices,
        totalTime,
        numLaps,
        expectedLaps,
        startLapNumber: startLap.lap_number,
        endLapNumber: endLap.lap_number,
        lapsInvolved: teamLaps.slice(g.startIndex === 0 ? 0 : g.startIndex - 1, g.endIndex + 1)
      }
    })

    return { anomalies: teamAnomalies, groups: formattedGroups, median }
  }

  const handleSmoothContiguousLapsLocally = async (teamId, group) => {
    const team = teams.find(t => t.id === teamId)
    if (!confirm(`Confirmer le lissage automatique du bloc pour la Moto #${team?.moto_number} du Tour ${group.startLapNumber} au Tour ${group.endLapNumber} ?`)) return

    // Backup before lissage
    const teamLapsToBackup = laps.filter(l => l.team_id === teamId).map(l => ({ ...l }))
    setLastLapsBackup({ teamId, laps: teamLapsToBackup })

    const teamLaps = laps.filter(l => l.team_id === teamId).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
    const baseTime = group.startIndex === 0 ? 0 : teamLaps[group.startIndex - 1].lap_time_ms
    const K = group.numLaps
    const T = group.totalTime
    
    const updates = []
    for (let i = 0; i < K; i++) {
      const idx = group.startIndex + i
      const lap = teamLaps[idx]
      const newTimeMs = Math.round(baseTime + (i + 1) * (T / K))
      updates.push(
        supabase
          .from('race_laps')
          .update({ lap_time_ms: newTimeMs })
          .eq('id', lap.id)
      )
    }

    const results = await Promise.all(updates)
    const err = results.find(r => r.error)
    if (err) {
      alert("Erreur lors du lissage : " + err.error.message)
      return
    }

    await resequenceLapNumbers(teamId)
    loadSession()
    alert("Passages lissés avec succès !")
  }

  const handleSmoothCustomRange = async () => {
    const startNum = parseInt(customSmoothRange.start)
    const endNum = parseInt(customSmoothRange.end)
    if (!startNum || !endNum || startNum >= endNum) {
      alert("Veuillez saisir un numéro de tour de début et de fin valides (début < fin).")
      return
    }

    const teamLaps = laps.filter(l => l.team_id === smoothingTeamId).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
    const startLapIdx = teamLaps.findIndex(l => l.lap_number === startNum)
    const endLapIdx = teamLaps.findIndex(l => l.lap_number === endNum)

    if (startLapIdx === -1 || endLapIdx === -1) {
      alert("Certains tours de la plage saisie sont introuvables.")
      return
    }

    const team = teams.find(t => t.id === smoothingTeamId)
    if (!confirm(`Confirmer le lissage de la Moto #${team?.moto_number} du Tour ${startNum} au Tour ${endNum} ?`)) return

    // Backup before custom range lissage
    const teamLapsToBackup = laps.filter(l => l.team_id === smoothingTeamId).map(l => ({ ...l }))
    setLastLapsBackup({ teamId: smoothingTeamId, laps: teamLapsToBackup })

    const baseTime = startLapIdx === 0 ? 0 : teamLaps[startLapIdx - 1].lap_time_ms
    const totalTime = teamLaps[endLapIdx].lap_time_ms - baseTime
    const K = endLapIdx - startLapIdx + 1

    const updates = []
    for (let i = 0; i < K; i++) {
      const idx = startLapIdx + i
      const lap = teamLaps[idx]
      const newTimeMs = Math.round(baseTime + (i + 1) * (totalTime / K))
      updates.push(
        supabase
          .from('race_laps')
          .update({ lap_time_ms: newTimeMs })
          .eq('id', lap.id)
      )
    }

    const results = await Promise.all(updates)
    const err = results.find(r => r.error)
    if (err) {
      alert("Erreur lors du lissage : " + err.error.message)
      return
    }

    await resequenceLapNumbers(smoothingTeamId)
    loadSession()
    alert("Passages de la plage lissés avec succès !")
    setCustomSmoothRange({ start: '', end: '' })
  }

  const handleAskGemini = async (teamId) => {
    if (!geminiApiKey.trim()) {
      alert("Veuillez saisir votre clé API Gemini d'abord.")
      return
    }

    setAiModelActive(true)
    setAiError('')
    setAiResponse(null)

    const team = teams.find(t => t.id === teamId)
    if (!team) {
      setAiError("Équipe introuvable.")
      setAiModelActive(false)
      return
    }

    const { median } = getTeamAnomaliesAndGroups(teamId)
    const teamLaps = laps.filter(l => l.team_id === teamId).sort((a, b) => a.lap_time_ms - b.lap_time_ms)

    const promptText = `
      Tu es un expert en chronométrage pour une course d'endurance moto tout-terrain (Moto #${team.moto_number}).
      Analyse la liste des passages cumulés ci-dessous pour détecter les anomalies (laps trop courts, doublons, sauts, etc.) et propose un plan d'action (lissage, corrections de temps, ou suppressions).
      
      Spécifications :
      - Temps médian typique d'un tour pour cette moto : ${formatTime(median)} (${median} ms).
      - Seuils physiques : un tour ne peut pas être plus rapide que 1m50s (110 000 ms) dans des conditions normales.
      - **ATTENTION (RATTRAPAGE MANUEL) :** Si tu vois des tours anormalement courts (ex: 1m30s ou 1m27s) consécutifs ou proches, cela provient très probablement d'un rattrapage manuel des organisateurs. Ils ont rajouté les passages oubliés à la main mais n'ont pas bien calculé les temps cumulés (les plaçant trop proches les uns des autres).
      - **DANS CE CAS, LE NOMBRE TOTAL DE TOURS EST CORRECT.** Ne supprime aucun tour dans ton plan d'action (laisse 'deletions' vide ou vide). À la place, propose de lisser les chronos de ces tours et des tours adjacents (ceux situés juste avant ou après le problème, comme des tours très longs de 3 ou 5 minutes qui contenaient le passage manqué) en répartissant la durée cumulée de manière homogène sur toute la plage pour qu'ils se rapprochent tous de la médiane de ${formatTime(median)}.
      - Ne propose de suppression ('deletions') que s'il s'agit d'un doublon absolu et indiscutable (ex: deux scans enregistrés à moins de 30 secondes l'un de l'autre de manière accidentelle).

      Voici la liste complète des passages pour cette moto (les temps 'lap_time_ms' sont cumulés depuis le début de la course) :
      ${JSON.stringify(teamLaps.map((l, idx) => {
        const duration = idx === 0 ? l.lap_time_ms : l.lap_time_ms - teamLaps[idx - 1].lap_time_ms
        return {
          id: l.id,
          lap_number: l.lap_number,
          lap_time_ms: l.lap_time_ms,
          duration_ms: duration,
          duration_formatted: formatTime(duration),
          recorded_at: l.recorded_at
        }
      }))}

      Réponds uniquement sous la forme d'un objet JSON contenant exactement cette structure :
      {
        "explanation": "Une explication détaillée en français de ton analyse du problème et de la solution que tu proposes. Explique clairement si tu as choisi de lisser une plage de tours pour préserver le nombre total de tours (cas du rattrapage manuel).",
        "corrections": [
          { "lap_id": "L'identifiant UUID du passage à corriger", "new_lap_time_ms": le nouveau temps cumulé en ms }
        ],
        "deletions": [
          "L'identifiant UUID du passage à supprimer (à n'utiliser que pour les doublons de scan évidents)"
        ]
      }
      
      Assure-toi que les temps cumulés dans 'corrections' restent strictement croissants et cohérents par rapport aux passages précédents et suivants non modifiés.
      Ne mets aucun texte en dehors du bloc JSON.
    `

    try {
      const data = await generateGeminiContent(
        [{ parts: [{ text: promptText }] }],
        geminiApiKey.trim(),
        { responseMimeType: "application/json" }
      )
      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!textResult) {
        throw new Error("L'IA n'a pas renvoyé de réponse exploitable.")
      }

      const parsedResponse = JSON.parse(textResult.trim())
      setAiResponse(parsedResponse)
    } catch (err) {
      console.error("Gemini API Error:", err)
      setAiError(err.message || "Une erreur est survenue lors de l'appel à Gemini.")
    } finally {
      setAiModelActive(false)
    }
  }

  const handleApplyAICorrections = async (teamId) => {
    if (!aiResponse) return
    const team = teams.find(t => t.id === teamId)
    const label = team ? `Moto #${team.moto_number}` : ''
    if (!confirm(`Appliquer le plan de correction de l'IA pour la ${label} ?`)) return

    // Backup before AI updates
    const teamLapsToBackup = laps.filter(l => l.team_id === teamId).map(l => ({ ...l }))
    setLastLapsBackup({ teamId, laps: teamLapsToBackup })

    try {
      if (aiResponse.deletions && aiResponse.deletions.length > 0) {
        for (const lapId of aiResponse.deletions) {
          const { error } = await supabase
            .from('race_laps')
            .delete()
            .eq('id', lapId)
          if (error) throw error
        }
      }

      if (aiResponse.corrections && aiResponse.corrections.length > 0) {
        for (const correction of aiResponse.corrections) {
          const { error } = await supabase
            .from('race_laps')
            .update({ lap_time_ms: correction.new_lap_time_ms })
            .eq('id', correction.lap_id)
          if (error) throw error
        }
      }

      await resequenceLapNumbers(teamId)
      
      alert("Corrections de l'IA appliquées avec succès !")
      setAiResponse(null)
      loadSession()
    } catch (err) {
      alert("Erreur lors de l'application des corrections : " + err.message)
    }
  }

  const handleUndoLastLissage = async () => {
    if (!lastLapsBackup) return
    const team = teams.find(t => t.id === lastLapsBackup.teamId)
    if (!confirm(`Restaurer les passages d'origine pour la Moto #${team?.moto_number} ?`)) return

    try {
      const currentTeamLaps = laps.filter(l => l.team_id === lastLapsBackup.teamId)
      const toDelete = currentTeamLaps.filter(l => !lastLapsBackup.laps.some(b => b.id === l.id))
      const toInsert = lastLapsBackup.laps.filter(b => !currentTeamLaps.some(l => l.id === b.id))
      const toUpdate = lastLapsBackup.laps.filter(b => currentTeamLaps.some(l => l.id === b.id))

      const dbPromises = []

      if (toDelete.length > 0) {
        dbPromises.push(
          supabase.from('race_laps').delete().in('id', toDelete.map(l => l.id))
        )
      }

      if (toInsert.length > 0) {
        dbPromises.push(
          supabase.from('race_laps').insert(toInsert.map(l => ({
            id: l.id,
            session_id: l.session_id,
            team_id: l.team_id,
            moto_number: l.moto_number,
            lap_time_ms: l.lap_time_ms,
            lap_number: l.lap_number,
            recorded_at: l.recorded_at,
            recorded_by: l.recorded_by,
            client_id: l.client_id
          })))
        )
      }

      if (toUpdate.length > 0) {
        toUpdate.forEach(l => {
          dbPromises.push(
            supabase.from('race_laps').update({ lap_time_ms: l.lap_time_ms }).eq('id', l.id)
          )
        })
      }

      await Promise.all(dbPromises)
      await resequenceLapNumbers(lastLapsBackup.teamId)
      
      setLastLapsBackup(null)
      loadSession()
      alert("Annulation réussie, chronos d'origine restaurés !")
    } catch (err) {
      alert("Erreur lors de l'annulation : " + err.message)
    }
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
  const canModify = raceSession && (raceSession.status !== 'published' || isRaceManager)

  if (raceSession && (raceSession.status === 'finished' || raceSession.status === 'published')) {
    const femaleWinner = getFemaleWinner()
    const femaleNames = []
    if (femaleWinner) {
      if (femaleWinner.pilot_1_sex === 'F') femaleNames.push(femaleWinner.pilot_1_name)
      if (femaleWinner.pilot_2_sex === 'F') femaleNames.push(femaleWinner.pilot_2_name)
      if (femaleWinner.pilot_3_sex === 'F') femaleNames.push(femaleWinner.pilot_3_name)
    }

    const juniorWinner = getJuniorWinner()
    const juniorNames = []
    if (juniorWinner) {
      if (juniorWinner.pilot_1_sex === 'J') juniorNames.push(juniorWinner.pilot_1_name)
      if (juniorWinner.pilot_2_sex === 'J') juniorNames.push(juniorWinner.pilot_2_name)
      if (juniorWinner.pilot_3_sex === 'J') juniorNames.push(juniorWinner.pilot_3_name)
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
              isRaceManager && (
                <button className="btn btn-outline btn-sm" style={{ borderColor: '#ff4444', color: '#ff4444' }} onClick={handleUnpublishResults}>
                  🔓 Dépublier
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
            {/* Overall Winners */}
            {(femaleWinner || juniorWinner) && (
              <div className="special-winners-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {femaleWinner && (
                  <div className="female-winner-card glass" style={{ margin: 0 }}>
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

                {juniorWinner && (
                  <div className="junior-winner-card glass" style={{ margin: 0 }}>
                    <div className="female-winner-header">
                      <span className="junior-crown-badge">👑 Coupe Junior</span>
                      <h4>Gagnant Junior Toute Catégorie</h4>
                    </div>
                    <div className="female-winner-body">
                      <div className="female-winner-trophy">🏆</div>
                      <div className="female-winner-details">
                        <span className="junior-pilot-name">{juniorNames.join(' & ')}</span>
                        <span className="female-pilot-team">Moto #{juniorWinner.moto_number} — {juniorWinner.category}</span>
                        <span className="female-pilot-stats">{juniorWinner.totalLaps} Tours complets — Meilleur tour : {formatTime(juniorWinner.bestLap)}</span>
                      </div>
                    </div>
                  </div>
                )}
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
                          <span className="review-podium-name">Moto #{catRankings[1].moto_number}</span>
                          <span className="review-podium-chrono">{catRankings[1].totalLaps} Tours</span>
                          <span className="review-podium-best">Min: {formatTime(catRankings[1].bestLap)}</span>
                          <div className="review-podium-block silver">2</div>
                        </div>
                      )}
                      {/* 1st place */}
                      {catRankings[0] && (
                        <div className="review-podium-step step-1">
                          <div className="review-podium-avatar">🥇</div>
                          <span className="review-podium-name">Moto #{catRankings[0].moto_number}</span>
                          <span className="review-podium-chrono">{catRankings[0].totalLaps} Tours</span>
                          <span className="review-podium-best">Min: {formatTime(catRankings[0].bestLap)}</span>
                          <div className="review-podium-block gold">1</div>
                        </div>
                      )}
                      {/* 3rd place */}
                      {catRankings[2] && (
                        <div className="review-podium-step step-3">
                          <div className="review-podium-avatar">🥉</div>
                          <span className="review-podium-name">Moto #{catRankings[2].moto_number}</span>
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
                  <div className="race-form-group" style={{ width: '75px', flex: 'none', marginRight: '15px' }}>
                    <label>Moto #</label>
                    <input 
                      type="number"
                      value={newLapForm.moto_number}
                      onChange={e => setNewLapForm({ ...newLapForm, moto_number: e.target.value })}
                      placeholder="N°"
                      required
                    />
                  </div>
                  <div className="race-form-group" style={{ flex: 1 }}>
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
                  <div className="race-form-group" style={{ flex: 1.3 }}>
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
                      const isEditing = editingLapId === l.id
                      return (
                        <tr key={l.id}>
                          <td>{new Date(l.recorded_at).toLocaleTimeString('fr-FR')}</td>
                          <td>#{l.moto_number}</td>
                          <td>{team?.pilot_1_name || '?'}</td>
                          <td>Tour {l.lap_number}</td>
                          <td>
                            {isEditing ? (
                              <div className="inline-lap-editor" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={editingLapForm.hours}
                                  onChange={e => setEditingLapForm({ ...editingLapForm, hours: e.target.value })}
                                  placeholder="H"
                                  className="inline-editor-input"
                                />
                                <span>h</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={editingLapForm.minutes}
                                  onChange={e => setEditingLapForm({ ...editingLapForm, minutes: e.target.value })}
                                  placeholder="Min"
                                  className="inline-editor-input"
                                />
                                <span>m</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={editingLapForm.seconds}
                                  onChange={e => setEditingLapForm({ ...editingLapForm, seconds: e.target.value })}
                                  placeholder="Sec"
                                  className="inline-editor-input"
                                />
                                <span>s</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  value={editingLapForm.milliseconds}
                                  onChange={e => setEditingLapForm({ ...editingLapForm, milliseconds: e.target.value })}
                                  placeholder="Ms"
                                  className="inline-editor-input inline-editor-input-ms"
                                />
                                <span>ms</span>
                              </div>
                            ) : (
                              formatTime(l.lap_time_ms)
                            )}
                          </td>
                          {canModify && (
                            <td>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => saveEditingLap(l.id)}
                                    style={{ background: 'none', border: 'none', color: '#00cc66', cursor: 'pointer', fontSize: '1.2rem' }}
                                    title="Enregistrer"
                                  >
                                    💾
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingLapId(null)}
                                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem' }}
                                    title="Annuler"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => startEditingLap(l)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '1.1rem' }}
                                    title="Modifier le passage"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLap(l.id)}
                                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.1rem' }}
                                    title="Supprimer le passage"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
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

            {/* Anomalies Checker & Intelligent Smoothing Assistant */}
            <div className="anomalies-checker glass" style={{ padding: '24px', marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0 }}>🕵️‍♂️ Assistant de Vérification & Lissage</h4>
                <button type="button" onClick={checkAnomalies} className="btn btn-outline btn-sm">
                  🔍 Lancer l'analyse générale
                </button>
              </div>

              {hasCheckedAnomalies && anomalies.length === 0 && (
                <div style={{ padding: '15px', background: 'rgba(0, 204, 102, 0.1)', color: '#00cc66', borderRadius: '8px', border: '1px solid rgba(0, 204, 102, 0.2)', marginBottom: '20px' }}>
                  ✅ Tout est OK ! Aucune anomalie détectée (aucun passage anormalement proche ou trop court).
                </div>
              )}
              
              {hasCheckedAnomalies && anomalies.length > 0 && (
                <div style={{ padding: '15px', background: 'rgba(255, 170, 0, 0.1)', color: '#ffaa00', borderRadius: '8px', border: '1px solid rgba(255, 170, 0, 0.2)', marginBottom: '20px' }}>
                  <h5 style={{ margin: '0 0 10px 0' }}>⚠️ {anomalies.length} anomalie(s) détectée(s) :</h5>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                    {anomalies.map(a => (
                      <li key={a.id} style={{ marginBottom: '5px', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setSmoothingTeamId(a.teamId); setAiResponse(null); setAiError(''); }}>
                        {a.message} (cliquez pour inspecter)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Team specific inspector */}
              <div className="smoothing-team-selector" style={{ marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                <div className="race-form-group" style={{ marginBottom: '15px' }}>
                  <label style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '0.95rem' }}>🔧 Inspecter et lisser les passages d'une équipe :</label>
                  <select 
                    value={smoothingTeamId} 
                    onChange={e => { setSmoothingTeamId(e.target.value); setAiResponse(null); setAiError(''); }}
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', color: '#fff', padding: '10px', borderRadius: '8px', width: '100%' }}
                  >
                    <option value="">-- Sélectionner une équipe à corriger --</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        Moto #{t.moto_number} - {t.pilot_1_name} {t.pilot_2_name ? `& ${t.pilot_2_name}` : ''} ({t.category})
                      </option>
                    ))}
                  </select>
                </div>

                {smoothingTeamId && (() => {
                  const { groups, median } = getTeamAnomaliesAndGroups(smoothingTeamId)
                  const teamLaps = laps.filter(l => l.team_id === smoothingTeamId).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
                  const selectedTeam = teams.find(t => t.id === smoothingTeamId)

                  if (teamLaps.length === 0) {
                    return <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun passage enregistré pour cette équipe.</p>
                  }

                  return (
                    <div className="smoothing-dashboard fade-in" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h5 style={{ margin: 0, color: 'var(--accent)', fontSize: '1rem' }}>📈 Tableau de bord de correction - Moto #{selectedTeam?.moto_number}</h5>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Temps Médian : <strong>{formatTime(median)}</strong></span>
                      </div>

                      {lastLapsBackup && lastLapsBackup.teamId === smoothingTeamId && (
                        <div style={{ marginBottom: '15px', background: 'rgba(255, 68, 68, 0.05)', border: '1px solid rgba(255, 68, 68, 0.2)', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', color: '#ff4444' }}>⚠️ Modifications en cours de test.</span>
                          <button
                            type="button"
                            onClick={handleUndoLastLissage}
                            className="btn btn-outline btn-xs"
                            style={{ borderColor: '#ff4444', color: '#ff4444', padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto' }}
                          >
                            ↩️ Annuler la dernière action (Restaurer l'origine)
                          </button>
                        </div>
                      )}

                      {/* Interactive Timeline Visualizer */}
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Frise chronologique des tours (cliquez sur un tour pour le modifier) :</label>
                      <div className="smoothing-timeline-container" style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                        <div className="smoothing-timeline" style={{ display: 'flex', gap: '6px', minWidth: 'max-content', padding: '2px' }}>
                          {teamLaps.map((lap, idx) => {
                            const dur = idx === 0 ? lap.lap_time_ms : lap.lap_time_ms - teamLaps[idx - 1].lap_time_ms
                            const isShort = dur < Math.max(30000, median * 0.65)
                            const isDouble = idx > 0 && dur < 30000
                            const isLong = dur > median * 2.3
                            
                            let blockClass = 'timeline-block normal'
                            let title = `Tour ${lap.lap_number} : ${formatTime(dur)}`
                            if (isDouble) {
                              blockClass = 'timeline-block double'
                              title += ' (Double passage)'
                            } else if (isShort) {
                              blockClass = 'timeline-block short'
                              title += ' (Trop court / anomalie)'
                            } else if (isLong) {
                              blockClass = 'timeline-block long'
                              title += ' (Arrêt stand / long)'
                            }

                            return (
                              <div
                                key={lap.id}
                                className={blockClass}
                                title={title}
                                onClick={() => startEditingLap(lap)}
                              >
                                <span className="block-lap-num">T{lap.lap_number}</span>
                                <span className="block-lap-dur">{(dur / 1000).toFixed(0)}s</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Timeline Legend */}
                      <div className="timeline-legend" style={{ display: 'flex', gap: '15px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: '#00cc66', borderRadius: '2px' }}></span> Normal</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: '#ffaa00', borderRadius: '2px' }}></span> Long / Stand</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: '#ff3333', borderRadius: '2px' }}></span> Anormalement court</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: '#e600e6', borderRadius: '2px' }}></span> Double passage (&lt;30s)</span>
                      </div>

                      {/* Recommendations and Local Solutions */}
                      <div className="smoothing-solutions" style={{ marginTop: '15px' }}>
                        <h6 style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>🛠️ Actions de lissage disponibles :</h6>
                        
                        {groups.length === 0 ? (
                          <p style={{ color: '#00cc66', fontSize: '0.85rem', margin: 0, padding: '10px', background: 'rgba(0, 204, 102, 0.05)', borderRadius: '6px' }}>
                            ✅ Aucune anomalie de temps court détectée pour cette moto. Les temps sont stables.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {groups.map((group, gIdx) => (
                              <div key={gIdx} className="anomaly-group-card" style={{ border: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#ffaa00', marginBottom: '8px' }}>
                                  ⚠️ Segment de tours {group.startLapNumber} à {group.endLapNumber}
                                </div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                  Temps cumulé sur la zone : <strong>{formatTime(group.totalTime)}</strong> pour <strong>{group.numLaps} passages</strong> enregistrés.<br/>
                                  Moyenne par tour : <strong>{formatTime(group.totalTime / group.numLaps)}</strong>.<br/>
                                  Nombre théorique de tours estimé : <strong>{group.expectedLaps} tour(s)</strong> (médiane : {formatTime(median)}).
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleSmoothContiguousLapsLocally(smoothingTeamId, group)}
                                    className="btn btn-outline btn-xs"
                                    style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                                  >
                                    ⚖️ Répartir le temps uniformément ({formatTime(group.totalTime / group.numLaps)} par tour)
                                  </button>

                                  {group.expectedLaps < group.numLaps && (
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '6px' }}>
                                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#ff3333', display: 'flex', alignItems: 'center' }}>
                                        💡 Il y a probablement {group.numLaps - group.expectedLaps} doublon(s). Supprimez le tour anormal avant de lisser :
                                      </p>
                                      {group.lapsInvolved.slice(1).map((lap, lIdx) => {
                                        const d = lap.lap_time_ms - group.lapsInvolved[lIdx].lap_time_ms
                                        const isSuspect = d < Math.max(30000, median * 0.65)
                                        if (isSuspect) {
                                          return (
                                            <button
                                              key={lap.id}
                                              type="button"
                                              onClick={() => handleDeleteLap(lap.id)}
                                              className="btn btn-outline btn-xs"
                                              style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: '#ff4444', color: '#ff4444' }}
                                            >
                                              🗑️ Supprimer Tour {lap.lap_number} ({formatTime(d)})
                                            </button>
                                          )
                                        }
                                        return null
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Custom Range Lissage Form */}
                      <div className="custom-range-smoothing" style={{ marginTop: '20px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '15px' }}>
                        <h6 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--accent)' }}>⚖️ Lisser une plage de tours personnalisée (Rattrapage Manuel) :</h6>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Lisser du Tour</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="Début"
                            value={customSmoothRange.start}
                            onChange={e => setCustomSmoothRange({ ...customSmoothRange, start: e.target.value })}
                            style={{ width: '70px', padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', textAlign: 'center' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>au Tour</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="Fin"
                            value={customSmoothRange.end}
                            onChange={e => setCustomSmoothRange({ ...customSmoothRange, end: e.target.value })}
                            style={{ width: '70px', padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', textAlign: 'center' }}
                          />
                          <button
                            type="button"
                            onClick={handleSmoothCustomRange}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto' }}
                          >
                            Lisser la plage
                          </button>
                        </div>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Cette action va répartir uniformément le temps cumulé total écoulé entre le tour précédant le début et le tour de fin sur toute la plage sélectionnée (conservation du nombre de tours).
                        </p>
                      </div>

                      {/* Gemini AI Assistant section */}
                      <div className="gemini-ai-assistant" style={{ marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                        <h6 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ff3399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🤖 Assistant Chrono IA (Gemini)
                        </h6>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          L'IA analyse toute la course de la moto, comprend les arrêts aux stands, et génère un plan de correction sur-mesure (suppression de doublons + lissage).
                        </p>

                        <div className="gemini-key-input-row" style={{ display: 'flex', gap: '8px', marginBottom: '15px', alignItems: 'center' }}>
                          {!import.meta.env.VITE_GEMINI_API_KEY ? (
                            <input
                              type="password"
                              placeholder="Entrez votre clé API Gemini (gratuite)..."
                              value={geminiApiKey}
                              onChange={e => {
                                setGeminiApiKey(e.target.value);
                                localStorage.setItem('myd_gemini_api_key', e.target.value);
                              }}
                              style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                            />
                          ) : (
                            <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(0, 204, 102, 0.05)', border: '1px solid rgba(0, 204, 102, 0.2)', borderRadius: '6px', color: '#00cc66', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🔒 Clé API configurée de manière sécurisée (variables d'environnement).</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAskGemini(smoothingTeamId)}
                            className="btn btn-primary"
                            disabled={!geminiApiKey.trim() || aiModelActive}
                            style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #ff007f 0%, #7f00ff 100%)', border: 'none', minHeight: 'auto' }}
                          >
                            {aiModelActive ? 'Analyse...' : 'Demander à l\'IA'}
                          </button>
                        </div>

                        {aiError && (
                          <div style={{ color: '#ff4444', fontSize: '0.8rem', padding: '10px', background: 'rgba(255, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 68, 0.2)', marginBottom: '15px' }}>
                            ❌ {aiError}
                          </div>
                        )}

                        {aiModelActive && (
                          <div className="ai-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                            <div className="ai-spinner"></div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>L'IA examine les passages et élabore une correction...</span>
                          </div>
                        )}

                        {aiResponse && (
                          <div className="ai-response-plan fade-in" style={{ background: 'rgba(255, 0, 127, 0.03)', border: '1px dashed rgba(255, 0, 127, 0.3)', padding: '15px', borderRadius: '8px', marginTop: '10px' }}>
                            <h6 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#ff3399' }}>📋 Diagnostic et Plan proposé par Gemini :</h6>
                            <p style={{ margin: '0 0 12px 0', fontSize: '0.82rem', color: '#fff', fontStyle: 'italic', lineHeight: '1.4' }}>
                              "{aiResponse.explanation}"
                            </p>
                            
                            <div style={{ fontSize: '0.8rem', marginBottom: '15px' }}>
                              {aiResponse.deletions && aiResponse.deletions.length > 0 && (
                                <div style={{ color: '#ff4444', marginBottom: '6px' }}>
                                  🔴 <strong>Passage(s) à supprimer :</strong>
                                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '15px' }}>
                                    {aiResponse.deletions.map((dId, idx) => {
                                      const lap = teamLaps.find(x => x.id === dId)
                                      return <li key={idx}>Tour {lap?.lap_number || '?'} ({lap ? formatTime(lap.lap_time_ms) : dId})</li>
                                    })}
                                  </ul>
                                </div>
                              )}

                              {aiResponse.corrections && aiResponse.corrections.length > 0 && (
                                <div style={{ color: '#00cc66' }}>
                                  🟢 <strong>Temps à recalculer :</strong>
                                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '15px' }}>
                                    {aiResponse.corrections.map((c, idx) => {
                                      const lap = teamLaps.find(x => x.id === c.lap_id)
                                      return (
                                        <li key={idx}>
                                          Tour {lap?.lap_number || '?'} : {lap ? formatTime(lap.lap_time_ms) : ''} ➔ <strong>{formatTime(c.new_lap_time_ms)}</strong>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleApplyAICorrections(smoothingTeamId)}
                              className="btn btn-outline"
                              style={{ width: '100%', fontSize: '0.85rem', borderColor: '#ff3399', color: '#ff3399' }}
                            >
                              🚀 Appliquer le plan de l'IA dans la base de données
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  )
                })()}
              </div>
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
                        <option value="J">🧒 Junior</option>
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
                          <span>{t.pilot_1_sex === 'F' ? '♀' : t.pilot_1_sex === 'J' ? '🧒' : '♂'} {t.pilot_1_name}</span>
                          {t.pilot_2_name && <span>{t.pilot_2_sex === 'F' ? '♀' : t.pilot_2_sex === 'J' ? '🧒' : '♂'} {t.pilot_2_name}</span>}
                          {t.pilot_3_name && <span>{t.pilot_3_sex === 'F' ? '♀' : t.pilot_3_sex === 'J' ? '🧒' : '♂'} {t.pilot_3_name}</span>}
                        </div>
                      </div>
                      {canModify && (
                        <div className="race-team-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="penalty-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,0,0,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                            <button onClick={() => handleUpdatePenalty(t.id, (t.penalty_laps || 0) - 1)} disabled={(t.penalty_laps || 0) <= 0} title="Retirer une pénalité" style={{ padding: '2px 6px', lineHeight: '1' }}>-</button>
                            <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{t.penalty_laps || 0} Pénalités</span>
                            <button onClick={() => handleUpdatePenalty(t.id, (t.penalty_laps || 0) + 1)} title="Ajouter une pénalité" style={{ padding: '2px 6px', lineHeight: '1' }}>+</button>
                          </div>
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

        {/* Delete session button is only visible to admin/organizer once published */}
        {(!isPublished || isRaceManager) && (
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
                <button
                  className="btn btn-ghost"
                  onClick={handleCancelRace}
                  style={{ marginLeft: '12px' }}
                  title="Repasse la session en configuration et fait disparaître le bouton LIVE côté spectateurs"
                >
                  ↩️ Annuler le lancement
                </button>
              </div>

              {/* ─── Live Video Broadcasting (Organiser) ─── */}
              <LiveVideoBroadcaster 
                session={session} 
                raceSession={raceSession} 
              />
            </>
          )}

          {/* ─── Durée de l'événement ─── */}
          <div className="race-duration glass">
            <h3>⏳ Durée de l'événement</h3>
            <div className="race-duration-row">
              <input
                type="number"
                min="1"
                step="1"
                value={durationInput}
                onChange={e => setDurationInput(e.target.value)}
                onBlur={handleSaveDuration}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                placeholder="Durée en minutes (ex: 120)"
                className="race-duration-input"
              />
              <span className="race-duration-unit">minutes</span>
              {raceSession.duration_minutes != null && (
                <span className="race-duration-preview">
                  ⏱ {Math.floor(raceSession.duration_minutes / 60) > 0
                    ? `${Math.floor(raceSession.duration_minutes / 60)}h${String(raceSession.duration_minutes % 60).padStart(2, '0')}`
                    : `${raceSession.duration_minutes} min`}
                </span>
              )}
            </div>
            <p className="race-duration-hint">
              Le temps restant s'affichera sous le chrono et côté spectateurs. Laissez vide pour ne pas afficher de décompte.
            </p>
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
                    <option value="J">🧒 Junior</option>
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
                        <span>{t.pilot_1_sex === 'F' ? '♀' : t.pilot_1_sex === 'J' ? '🧒' : '♂'} {t.pilot_1_name}</span>
                        {t.pilot_2_name && <span>{t.pilot_2_sex === 'F' ? '♀' : t.pilot_2_sex === 'J' ? '🧒' : '♂'} {t.pilot_2_name}</span>}
                        {t.pilot_3_name && <span>{t.pilot_3_sex === 'F' ? '♀' : t.pilot_3_sex === 'J' ? '🧒' : '♂'} {t.pilot_3_name}</span>}
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

    // Cascade de qualités : si la caméra refuse 1440p (OverconstrainedError),
    // on retombe sur 1080p puis 720p avant d'abandonner.
    const QUALITY_PROFILES = [
      { label: '1440p', width: 2560, height: 1440, frameRate: 30, bitrateMin: 3000, bitrateMax: 7000 },
      { label: '1080p', width: 1920, height: 1080, frameRate: 30, bitrateMin: 2000, bitrateMax: 4500 },
      { label: '720p',  width: 1280, height: 720,  frameRate: 30, bitrateMin: 1000, bitrateMax: 2500 },
    ]

    try {
      // 1. Concurrency Check : un autre organisateur est-il déjà en train de streamer ?
      const { data: latestSession, error: checkError } = await supabase
        .from('race_sessions')
        .select('live_stream_active, live_stream_user_id')
        .eq('id', raceSession.id)
        .single()

      if (checkError) throw checkError

      if (latestSession.live_stream_active && latestSession.live_stream_user_id !== session.user.id) {
        throw new Error("⚠️ Un live est déjà en cours de diffusion sur cette course par un autre organisateur.")
      }

      // Si c'est NOTRE propre verrou orphelin (crash précédent, fermeture brutale),
      // on le libère silencieusement avant de relancer.
      if (latestSession.live_stream_active && latestSession.live_stream_user_id === session.user.id) {
        await supabase.from('race_sessions').update({
          live_stream_active: false,
          live_stream_user_id: null
        }).eq('id', raceSession.id)
      }

      // 2. Init Agora client
      const appId = import.meta.env.VITE_AGORA_APP_ID
      if (!appId) throw new Error("VITE_AGORA_APP_ID est manquant dans la configuration.")

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" })
      clientRef.current = client

      const channelName = `live-stream-${raceSession.id}`

      // 2.bis Récupère un token Agora via l'Edge Function (Secured Mode).
      // Si la function n'est pas déployée OU répond 500 "missing_secrets",
      // on retombe sur un join sans token (Testing Mode). Comme ça la migration
      // vers Secured Mode est non-bloquante.
      let agoraToken = null
      try {
        const { data: tokenData, error: tokenErr } = await supabase.functions.invoke('agora-token', {
          body: { channelName, uid: session.user.id, role: 'publisher' },
        })
        if (tokenErr) throw tokenErr
        if (tokenData?.token) {
          agoraToken = tokenData.token
        } else if (tokenData?.error) {
          console.warn('[stream] agora-token a renvoyé une erreur, fallback no-token:', tokenData)
        }
      } catch (tokenFetchErr) {
        console.warn('[stream] agora-token introuvable ou en erreur, fallback no-token:', tokenFetchErr?.message || tokenFetchErr)
      }

      try {
        await client.join(appId, channelName, agoraToken, session.user.id)
      } catch (joinErr) {
        // Messages Agora typiques : CAN_NOT_GET_GATEWAY_SERVER, INVALID_PARAMS,
        // UNEXPECTED_RESPONSE: invalid appid (= projet en Secured Mode mais
        // token manquant/invalide), dynamic key timeout, etc.
        const code = joinErr?.code || joinErr?.name
        const isAuthIssue = /invalid appid|dynamic key|token/i.test(joinErr?.message || '')
        const hint = isAuthIssue
          ? `Le projet Agora est probablement en "Secured Mode". ` +
            `Déploie l'Edge Function agora-token (cf. supabase/functions/agora-token/) ` +
            `OU repasse temporairement le projet en "Testing Mode" dans la console Agora.`
          : `Si le problème persiste, rafraîchis la page.`
        throw new Error(
          `Connexion Agora refusée (${code || 'erreur API'}): ${joinErr.message || joinErr}. ${hint}`,
          { cause: joinErr }
        )
      }

      // 3. Création des pistes vidéo + audio (avec fallback de résolution)
      let videoTrack = null
      let lastVideoErr = null
      for (const profile of QUALITY_PROFILES) {
        try {
          videoTrack = await AgoraRTC.createCameraVideoTrack({
            encoderConfig: {
              width: profile.width,
              height: profile.height,
              frameRate: profile.frameRate,
              bitrateMin: profile.bitrateMin,
              bitrateMax: profile.bitrateMax,
            },
            facingMode: "environment",
            optimizationMode: "detail"
          })
          console.info(`[stream] Caméra ouverte en ${profile.label}`)
          break
        } catch (camErr) {
          lastVideoErr = camErr
          console.warn(`[stream] ${profile.label} refusé, on tente plus bas:`, camErr?.message || camErr)
        }
      }
      if (!videoTrack) {
        throw new Error(
          `Impossible d'ouvrir la caméra (${lastVideoErr?.name || 'erreur'}): ` +
          `${lastVideoErr?.message || lastVideoErr}. Vérifie les autorisations caméra du navigateur.`,
          { cause: lastVideoErr }
        )
      }

      let audioTrack = null
      try {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      } catch (micErr) {
        throw new Error(
          `Impossible d'ouvrir le micro (${micErr?.name || 'erreur'}): ` +
          `${micErr?.message || micErr}. Vérifie les autorisations micro du navigateur.`,
          { cause: micErr }
        )
      }

      trackRef.current = videoTrack
      audioTrackRef.current = audioTrack

      // Dual stream pour bitrate adaptatif
      try { await client.enableDualStream() } catch (dualErr) { console.warn('enableDualStream failed:', dualErr) }

      // 4. Publish
      await client.publish([videoTrack, audioTrack])

      // 5. Update DB
      const { error: updateErr } = await supabase.from('race_sessions').update({
        live_stream_active: true,
        live_stream_user_id: session.user.id
      }).eq('id', raceSession.id)
      if (updateErr) throw updateErr

      setIsStreaming(true)
    } catch (err) {
      console.error('[stream] startStreaming failed:', err)
      setErrorMsg(err.message || String(err))
      // Cleanup en cas d'échec
      if (trackRef.current) {
        try { trackRef.current.close() } catch { /* ignore */ }
        trackRef.current = null
      }
      if (audioTrackRef.current) {
        try { audioTrackRef.current.close() } catch { /* ignore */ }
        audioTrackRef.current = null
      }
      if (clientRef.current) {
        try { await clientRef.current.leave() } catch { /* ignore */ }
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
