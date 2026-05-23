import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './TeamsManager.css'

/**
 * TeamsManager — Création / adhésion / liste des teams privées
 *
 * Sécurité : tout passe par les RPCs SECURITY DEFINER (create_team, join_team,
 * leave_team) définies en V33. Pas d'INSERT direct sur team_members côté
 * client. La requête SELECT sur teams est filtrée par RLS.
 */
export default function TeamsManager({ session, onTeamsChange }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const loadTeams = async () => {
    if (!session) return
    setLoading(true)
    // RLS filtre : seules les teams dont je suis membre remontent
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, owner_id, invite_code, created_at')
      .order('created_at', { ascending: false })
    if (!error) {
      setTeams(data || [])
      if (onTeamsChange) onTeamsChange(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadTeams() }, [session?.user?.id])

  const handleCreate = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (name.length < 2) return
    setCreating(true)
    setError(null)
    setInfo(null)
    const { data, error } = await supabase.rpc('create_team', { team_name: name })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    const created = data?.[0]
    if (created) {
      setInfo(`Team "${name}" créée ! Code d'invitation : ${created.invite_code}`)
    }
    setNewName('')
    loadTeams()
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError('Le code doit faire 6 caractères')
      return
    }
    setJoining(true)
    setError(null)
    setInfo(null)
    const { error } = await supabase.rpc('join_team', { code })
    setJoining(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo('Tu as rejoint la team !')
    setJoinCode('')
    loadTeams()
  }

  const handleLeave = async (team) => {
    if (team.owner_id === session.user.id) {
      if (!confirm(`Supprimer la team "${team.name}" ? Tous les membres seront retirés et l'historique du chat perdu.`)) return
      const { error } = await supabase.from('teams').delete().eq('id', team.id)
      if (error) {
        setError(error.message)
        return
      }
      setInfo(`Team "${team.name}" supprimée`)
    } else {
      if (!confirm(`Quitter la team "${team.name}" ?`)) return
      const { error } = await supabase.rpc('leave_team', { team: team.id })
      if (error) {
        setError(error.message)
        return
      }
      setInfo(`Tu as quitté "${team.name}"`)
    }
    loadTeams()
  }

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code)
    setInfo(`Code ${code} copié dans le presse-papier`)
    setTimeout(() => setInfo(null), 2500)
  }

  const hasTeam = teams.length > 0

  return (
    <div className="teams-manager">
      {!hasTeam && (
        <div className="teams-actions-row">
          <form onSubmit={handleCreate} className="teams-form">
            <label className="teams-form-label">➕ Créer ma team</label>
            <div className="teams-form-row">
              <input
                type="text"
                placeholder="Nom de ma team"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating || newName.trim().length < 2}>
                {creating ? '...' : 'Créer'}
              </button>
            </div>
          </form>

          <form onSubmit={handleJoin} className="teams-form">
            <label className="teams-form-label">🔑 Rejoindre via code</label>
            <div className="teams-form-row">
              <input
                type="text"
                placeholder="ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'monospace' }}
              />
              <button type="submit" className="btn btn-outline btn-sm" disabled={joining || joinCode.trim().length !== 6}>
                {joining ? '...' : 'Rejoindre'}
              </button>
            </div>
          </form>
        </div>
      )}

      {hasTeam && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 4px', fontStyle: 'italic' }}>
          Tu fais déjà partie d'une team. Quitte-la pour en créer ou en rejoindre une autre.
        </p>
      )}

      {error && <div className="teams-msg teams-msg-error">⚠️ {error}</div>}
      {info && <div className="teams-msg teams-msg-info">✅ {info}</div>}

      <div className="teams-list">
        {loading ? (
          <p className="teams-empty">Chargement...</p>
        ) : teams.length === 0 ? (
          <p className="teams-empty">Tu n'es membre d'aucune team pour l'instant. Crée la tienne ou rejoins-en une avec un code.</p>
        ) : (
          teams.map(t => {
            const isOwner = t.owner_id === session.user.id
            return (
              <div key={t.id} className="teams-card">
                <div className="teams-card-main">
                  <div className="teams-card-name">
                    {isOwner ? '👑' : '👥'} {t.name}
                  </div>
                  <button
                    type="button"
                    className="teams-card-code"
                    onClick={() => copyCode(t.invite_code)}
                    title="Cliquer pour copier"
                  >
                    {t.invite_code} 📋
                  </button>
                </div>
                <button
                  type="button"
                  className="teams-card-leave"
                  onClick={() => handleLeave(t)}
                  title={isOwner ? 'Supprimer la team' : 'Quitter la team'}
                >
                  {isOwner ? '🗑️ Supprimer' : '🚪 Quitter'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
