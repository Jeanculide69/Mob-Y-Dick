import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './TeamsAdmin.css'

/**
 * TeamsAdmin — Module admin pour gérer toutes les teams privées des spectateurs.
 *
 * Accès via les RPCs SECURITY DEFINER de V36 (admin_*). Chaque RPC vérifie
 * is_user_admin() en début — pas besoin d'élargir le RLS aux admins.
 */
export default function TeamsAdmin() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [expandedTeamId, setExpandedTeamId] = useState(null)
  const [membersByTeam, setMembersByTeam] = useState({}) // team_id → members[]
  const [addableUsers, setAddableUsers] = useState([])
  const [addingMemberTeamId, setAddingMemberTeamId] = useState(null)
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('')

  const loadTeams = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_teams')
    if (error) setError(error.message)
    else setTeams(data || [])
    setLoading(false)
  }

  const loadMembers = async (teamId) => {
    const { data, error } = await supabase.rpc('admin_list_team_members', { target_team: teamId })
    if (error) {
      setError(error.message)
      return
    }
    setMembersByTeam(prev => ({ ...prev, [teamId]: data || [] }))
  }

  const loadAddableUsers = async () => {
    const { data, error } = await supabase.rpc('admin_list_addable_users')
    if (!error) setAddableUsers(data || [])
  }

  useEffect(() => { loadTeams() }, [])

  const toggleExpand = (teamId) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null)
    } else {
      setExpandedTeamId(teamId)
      if (!membersByTeam[teamId]) loadMembers(teamId)
    }
  }

  const handleDeleteTeam = async (team) => {
    if (!confirm(`⚠️ Supprimer la team "${team.name}" ?\n\nTous ses membres seront retirés et tout l'historique chat + annonces sera perdu.\n\nCette action est irréversible.`)) return
    const { error } = await supabase.rpc('admin_delete_team', { target_team: team.id })
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`Team "${team.name}" supprimée`)
    loadTeams()
  }

  const handleRemoveMember = async (teamId, member) => {
    if (!confirm(`Retirer ${member.display_name || 'ce membre'} de la team ?`)) return
    const { error } = await supabase.rpc('admin_remove_member', {
      target_team: teamId,
      target_user: member.user_id
    })
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`Membre retiré`)
    loadMembers(teamId)
    loadTeams() // refresh member_count
  }

  const handleAddMember = async (teamId) => {
    if (!selectedUserToAdd) return
    const { error } = await supabase.rpc('admin_add_member', {
      target_team: teamId,
      target_user: selectedUserToAdd
    })
    if (error) {
      setError(error.message)
      return
    }
    setInfo('Membre ajouté')
    setAddingMemberTeamId(null)
    setSelectedUserToAdd('')
    loadMembers(teamId)
    loadTeams()
    loadAddableUsers()
  }

  const startAddMember = (teamId) => {
    setAddingMemberTeamId(teamId)
    setSelectedUserToAdd('')
    loadAddableUsers()
  }

  return (
    <div className="teams-admin">
      <h3 className="teams-admin-title">👥 Teams Privées (spectateurs)</h3>

      {error && (
        <div className="teams-admin-msg teams-admin-msg-error">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="teams-admin-msg-close">✕</button>
        </div>
      )}
      {info && (
        <div className="teams-admin-msg teams-admin-msg-info">
          ✅ {info}
          <button onClick={() => setInfo(null)} className="teams-admin-msg-close">✕</button>
        </div>
      )}

      {loading ? (
        <p className="teams-admin-empty">Chargement...</p>
      ) : teams.length === 0 ? (
        <p className="teams-admin-empty">Aucune team créée pour le moment.</p>
      ) : (
        <div className="teams-admin-list">
          {teams.map(t => {
            const isExpanded = expandedTeamId === t.id
            const members = membersByTeam[t.id]
            return (
              <div key={t.id} className={`teams-admin-card ${isExpanded ? 'is-expanded' : ''}`}>
                <div className="teams-admin-row">
                  <button
                    type="button"
                    className="teams-admin-expand"
                    onClick={() => toggleExpand(t.id)}
                  >
                    <span className="teams-admin-arrow">{isExpanded ? '▼' : '▶'}</span>
                    <span className="teams-admin-name">{t.name}</span>
                    <span className="teams-admin-count">{t.member_count} membre{Number(t.member_count) > 1 ? 's' : ''}</span>
                    <span className="teams-admin-code">{t.invite_code}</span>
                  </button>
                  <button
                    type="button"
                    className="teams-admin-delete"
                    onClick={() => handleDeleteTeam(t)}
                    title="Supprimer la team"
                  >
                    🗑️
                  </button>
                </div>

                <div className="teams-admin-meta">
                  <span>👑 {t.owner_name || '(profil inconnu)'}</span>
                  <span>•</span>
                  <span>Créée le {new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>

                {isExpanded && (
                  <div className="teams-admin-members">
                    {!members ? (
                      <p className="teams-admin-empty">Chargement des membres...</p>
                    ) : members.length === 0 ? (
                      <p className="teams-admin-empty">Aucun membre.</p>
                    ) : (
                      <ul className="teams-admin-members-list">
                        {members.map(m => (
                          <li key={m.user_id} className="teams-admin-member">
                            <img
                              src={m.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`}
                              alt=""
                              className="teams-admin-avatar"
                              loading="lazy"
                            />
                            <span className="teams-admin-member-name">
                              {m.display_name || '(sans pseudo)'}
                              {m.role === 'owner' && <span className="teams-admin-owner-badge">👑 créateur</span>}
                            </span>
                            <span className="teams-admin-joined">
                              {new Date(m.joined_at).toLocaleDateString('fr-FR')}
                            </span>
                            {m.role !== 'owner' && (
                              <button
                                type="button"
                                className="teams-admin-remove-member"
                                onClick={() => handleRemoveMember(t.id, m)}
                                title="Retirer ce membre"
                              >
                                ❌
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Add member zone */}
                    {addingMemberTeamId === t.id ? (
                      <div className="teams-admin-add-form">
                        <select
                          value={selectedUserToAdd}
                          onChange={(e) => setSelectedUserToAdd(e.target.value)}
                        >
                          <option value="">— Choisir un utilisateur —</option>
                          {addableUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.display_name || '(sans pseudo)'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAddMember(t.id)}
                          disabled={!selectedUserToAdd}
                        >
                          Ajouter
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setAddingMemberTeamId(null); setSelectedUserToAdd('') }}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm teams-admin-add-btn"
                        onClick={() => startAddMember(t.id)}
                      >
                        ➕ Ajouter un membre
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
