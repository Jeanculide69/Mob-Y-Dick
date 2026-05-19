import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { PERMISSION_LABELS, ROLE_CONFIG } from './ProfilePage'
import './UserManagement.css'

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS)

export default function UserManagement({ users, onRefresh }) {
  const [activeTab, setActiveTab] = useState('users') // 'users' or 'pseudos'
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState(null)
  const [saving, setSaving] = useState(null)

  const pendingRequests = users.filter(u => u.display_name_status === 'pending')

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
      
      const { data, error } = await supabase.from('profiles').update(update).eq('id', userId).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("Mise à jour refusée par la base de données (RLS). Vérifiez vos droits d'administrateur.")
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
      
      const { data, error } = await supabase.from('profiles').update({ permissions: newPerms }).eq('id', userId).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("Mise à jour refusée par la base de données (RLS).")
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
      const { data, error } = await supabase.from('profiles').update({ permissions: perms }).eq('id', userId).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("Mise à jour refusée par la base de données (RLS).")
      onRefresh()
    } catch (err) {
      alert('Erreur: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleApprovePseudo = async (userId, requestedName, currentChanges) => {
    if (!window.confirm(`Approuver le pseudo "${requestedName}" ?`)) return
    setSaving(userId)
    try {
      const { data, error } = await supabase.from('profiles').update({
        display_name: requestedName,
        display_name_changes: (currentChanges || 0) + 1,
        pending_display_name: null,
        display_name_status: 'approved'
      }).eq('id', userId).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("Validation refusée par la base de données (RLS).")
      onRefresh()
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleRejectPseudo = async (userId) => {
    if (!window.confirm("Refuser cette demande de pseudo ?")) return
    setSaving(userId)
    try {
      const { data, error } = await supabase.from('profiles').update({
        pending_display_name: null,
        display_name_status: 'rejected'
      }).eq('id', userId).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error("Rejet refusé par la base de données (RLS).")
      onRefresh()
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="user-mgmt">
      <div className="user-mgmt-header" style={{ marginBottom: '15px' }}>
        <div className="user-mgmt-tabs" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setActiveTab('users')}
            style={{ whiteSpace: 'nowrap' }}
          >
            👥 Membres ({users.length})
          </button>
          <button
            className={`btn ${activeTab === 'pseudos' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setActiveTab('pseudos')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            ✏️ Pseudos
            {pendingRequests.length > 0 && (
              <span style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="user-mgmt-search-wrap" style={{ marginBottom: '20px' }}>
          <span className="user-mgmt-search-icon">🔍</span>
          <input 
            type="text"
            className="user-mgmt-search"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {activeTab === 'users' ? (
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
      ) : (
        <div className="user-mgmt-list">
          {pendingRequests.length === 0 ? (
            <div className="user-mgmt-empty" style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
              ✨ Aucune demande de pseudo en attente !
            </div>
          ) : (
            pendingRequests.map(u => (
              <div key={u.id} className="user-mgmt-card glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img 
                    src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`}
                    alt="avatar"
                    className="user-mgmt-avatar"
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{u.email}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                      <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem' }}>
                        {u.display_name || 'Sans pseudo'}
                      </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>➔</span>
                      <span style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 'bold', background: 'rgba(255,85,0,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,85,0,0.2)' }}>
                        {u.pending_display_name}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-primary btn-sm" 
                      onClick={() => handleApprovePseudo(u.id, u.pending_display_name, u.display_name_changes)}
                      disabled={saving === u.id}
                      style={{ background: '#00cc66', borderColor: '#00cc66' }}
                    >
                      ✔️ Valider
                    </button>
                    <button 
                      className="btn btn-outline btn-sm" 
                      onClick={() => handleRejectPseudo(u.id)}
                      disabled={saving === u.id}
                      style={{ color: '#ff4444', borderColor: '#ff4444' }}
                    >
                      ❌ Refuser
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
