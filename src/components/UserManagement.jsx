import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { PERMISSION_LABELS, ROLE_CONFIG } from './ProfilePage'
import './UserManagement.css'

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS)

export default function UserManagement({ users, onRefresh }) {
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState(null)
  const [saving, setSaving] = useState(null)

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase()
    return (u.display_name || '').toLowerCase().includes(q) || 
           (u.email || '').toLowerCase().includes(q)
  })

  const handleRoleChange = async (userId, newRole, userName) => {
    if (!window.confirm(`Changer le rôle de ${userName} en "${ROLE_CONFIG[newRole]?.label || newRole}" ?`)) return
    setSaving(userId)
    try {
      // If setting to admin, grant all permissions automatically
      const perms = newRole === 'admin' ? ALL_PERMISSIONS : undefined
      const update = { role: newRole }
      if (perms) update.permissions = perms
      
      await supabase.from('profiles').update(update).eq('id', userId)
      onRefresh()
    } catch (err) {
      alert('Erreur: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handlePermissionToggle = async (userId, perm, currentPerms) => {
    setSaving(userId)
    try {
      const perms = currentPerms || []
      const newPerms = perms.includes(perm) 
        ? perms.filter(p => p !== perm)
        : [...perms, perm]
      
      await supabase.from('profiles').update({ permissions: newPerms }).eq('id', userId)
      onRefresh()
    } catch (err) {
      alert('Erreur: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleGrantPreset = async (userId, preset) => {
    setSaving(userId)
    try {
      let perms = []
      if (preset === 'organisateur') {
        perms = ['manage_events', 'manage_races']
      } else if (preset === 'moderator') {
        perms = ['moderate_content']
      } else if (preset === 'editor') {
        perms = ['manage_events', 'manage_products', 'manage_gallery', 'manage_team', 'manage_bikes']
      }
      await supabase.from('profiles').update({ permissions: perms }).eq('id', userId)
      onRefresh()
    } catch (err) {
      alert('Erreur: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="user-mgmt">
      <div className="user-mgmt-header">
        <h3>👥 Gestion des Utilisateurs ({users.length})</h3>
        <div className="user-mgmt-search-wrap">
          <span className="user-mgmt-search-icon">🔍</span>
          <input 
            type="text"
            className="user-mgmt-search"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="user-mgmt-list">
        {filteredUsers.length === 0 && (
          <div className="user-mgmt-empty">Aucun utilisateur trouvé.</div>
        )}
        {filteredUsers.map(u => {
          const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.user
          const isExpanded = expandedUser === u.id
          const perms = u.permissions || []

          return (
            <div key={u.id} className={`user-mgmt-card glass ${isExpanded ? 'expanded' : ''}`}>
              {/* ─── Main Row ─── */}
              <div className="user-mgmt-row" onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                <img 
                  src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`}
                  alt="avatar"
                  className="user-mgmt-avatar"
                />
                <div className="user-mgmt-info">
                  <span className="user-mgmt-name">{u.display_name || 'Sans nom'}</span>
                  <span className="user-mgmt-email">{u.email}</span>
                </div>
                <div className="user-mgmt-role-wrap" onClick={e => e.stopPropagation()}>
                  <select 
                    className="user-mgmt-role-select"
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value, u.display_name)}
                    style={{ borderColor: rc.color }}
                    disabled={saving === u.id}
                  >
                    <option value="user">👤 Membre</option>
                    <option value="moderator">🛡️ Modérateur</option>
                    <option value="organisateur">🏁 Organisateur</option>
                    <option value="admin">👑 Admin</option>
                  </select>
                </div>
                <span className={`user-mgmt-chevron ${isExpanded ? 'open' : ''}`}>▼</span>
              </div>

              {/* ─── Expanded Permissions Panel ─── */}
              {isExpanded && (
                <div className="user-mgmt-perms-panel">
                  <div className="user-mgmt-perms-header">
                    <h4>Permissions de {u.display_name || u.email?.split('@')[0]}</h4>
                    {u.role === 'admin' && (
                      <span className="user-mgmt-admin-note">👑 Les admins ont toutes les permissions par défaut</span>
                    )}
                  </div>

                  {u.role !== 'admin' && (
                    <>
                      {/* Quick presets */}
                      <div className="user-mgmt-presets">
                        <span className="user-mgmt-preset-label">Presets rapides :</span>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleGrantPreset(u.id, 'organisateur')}>🏁 Organisateur</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleGrantPreset(u.id, 'moderator')}>🛡️ Modérateur</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleGrantPreset(u.id, 'editor')}>✏️ Éditeur</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleGrantPreset(u.id, 'clear')} style={{ color: '#ff4444' }}>🗑️ Tout retirer</button>
                      </div>

                      {/* Individual permissions */}
                      <div className="user-mgmt-perms-grid">
                        {ALL_PERMISSIONS.map(perm => {
                          const info = PERMISSION_LABELS[perm]
                          const hasIt = perms.includes(perm)
                          return (
                            <label key={perm} className={`user-mgmt-perm-item ${hasIt ? 'active' : ''}`}>
                              <input 
                                type="checkbox"
                                checked={hasIt}
                                onChange={() => handlePermissionToggle(u.id, perm, perms)}
                                disabled={saving === u.id}
                              />
                              <span className="user-mgmt-perm-icon">{info.icon}</span>
                              <span className="user-mgmt-perm-name">{info.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}

                  <div className="user-mgmt-perms-footer">
                    <span className="user-mgmt-date">Inscrit le {new Date(u.created_at).toLocaleDateString('fr-FR')}</span>
                    {saving === u.id && <span className="user-mgmt-saving">Sauvegarde...</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
