import { useState } from 'react'
import { supabase } from '../supabaseClient'
import './ProfilePage.css'

const PERMISSION_LABELS = {
  manage_events: { icon: '📅', label: 'Événements' },
  manage_products: { icon: '🛍️', label: 'Boutique' },
  manage_gallery: { icon: '📸', label: 'Galerie' },
  manage_team: { icon: '👥', label: 'Équipe' },
  manage_bikes: { icon: '🏍️', label: 'Motos' },
  manage_settings: { icon: '⚙️', label: 'Paramètres' },
  manage_races: { icon: '🏁', label: 'Courses' },
  manage_users: { icon: '🔐', label: 'Utilisateurs' },
  moderate_content: { icon: '🛡️', label: 'Modération' },
}

const ROLE_CONFIG = {
  admin: { label: 'Administrateur', icon: '👑', color: '#ff5500' },
  organisateur: { label: 'Organisateur', icon: '🏁', color: '#00cc66' },
  moderator: { label: 'Modérateur', icon: '🛡️', color: '#5599ff' },
  user: { label: 'Membre', icon: '👤', color: '#888' },
}

export default function ProfilePage({ session, profile, onLogout, orders = [], onProfileUpdate }) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  if (!session || !profile) return null

  const roleConfig = ROLE_CONFIG[profile.role] || ROLE_CONFIG.user
  const permissions = profile.permissions || []
  const myOrders = orders.filter(o => o.user_id === session.user.id)

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const { error } = await supabase.from('profiles').update({
        display_name: displayName
      }).eq('id', session.user.id)
      
      if (error) throw error
      setSaveMsg('✅ Profil mis à jour !')
      setEditing(false)
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      setSaveMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="section page-top" style={{ minHeight: '60vh' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Espace Personnel</span>
          <h2>Mon Profil</h2>
        </div>

        <div className="profile-page-container">
          {/* ─── Profile Card ─── */}
          <div className="profile-card glass">
            <div className="profile-card-banner">
              <div className="profile-card-banner-gradient" />
            </div>
            <div className="profile-card-body">
              <div className="profile-avatar-wrapper">
                <img 
                  src={profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user.email}`} 
                  alt="Avatar" 
                  className="profile-avatar-large"
                />
                <span className="profile-role-dot" style={{ backgroundColor: roleConfig.color }} />
              </div>

              <div className="profile-info-main">
                {editing ? (
                  <div className="profile-edit-row">
                    <input 
                      type="text"
                      className="profile-edit-input"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Votre pseudo"
                      maxLength={30}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                      {saving ? '...' : '✓'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDisplayName(profile.display_name) }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="profile-name-row">
                    <h3 className="profile-display-name">{profile.display_name || session.user.email.split('@')[0]}</h3>
                    <button className="profile-edit-btn" onClick={() => setEditing(true)} title="Modifier le pseudo">✏️</button>
                  </div>
                )}
                <p className="profile-email">{session.user.email}</p>
                
                {saveMsg && <div className="profile-save-msg">{saveMsg}</div>}

                <div className="profile-role-badge" style={{ borderColor: roleConfig.color, color: roleConfig.color }}>
                  {roleConfig.icon} {roleConfig.label}
                </div>
              </div>

              <div className="profile-meta-grid">
                <div className="profile-meta-item">
                  <span className="profile-meta-label">Inscrit le</span>
                  <span className="profile-meta-value">
                    {new Date(profile.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="profile-meta-item">
                  <span className="profile-meta-label">Commandes</span>
                  <span className="profile-meta-value">{myOrders.length}</span>
                </div>
                <div className="profile-meta-item">
                  <span className="profile-meta-label">Connexion</span>
                  <span className="profile-meta-value">
                    {session.user.app_metadata?.provider === 'google' ? '🔑 Google' : '📧 Email'}
                  </span>
                </div>
              </div>

              {/* Permissions badges */}
              {permissions.length > 0 && (
                <div className="profile-permissions">
                  <h4 className="profile-section-title">Mes Permissions</h4>
                  <div className="profile-perm-grid">
                    {permissions.map(perm => (
                      <span key={perm} className="profile-perm-badge">
                        {PERMISSION_LABELS[perm]?.icon || '🔧'} {PERMISSION_LABELS[perm]?.label || perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-outline profile-logout-btn" onClick={onLogout}>
                🚪 Déconnexion
              </button>
            </div>
          </div>

          {/* ─── Orders History ─── */}
          <div className="profile-orders-section">
            <h3 className="profile-section-title">📦 Mon Historique de Commandes</h3>
            
            {myOrders.length === 0 ? (
              <div className="profile-empty-state glass">
                <span className="profile-empty-icon">🛒</span>
                <p>Vous n'avez pas encore passé de commande.</p>
                <span className="profile-empty-sub">Découvrez notre boutique pour vos premiers goodies MobCross !</span>
              </div>
            ) : (
              <div className="profile-orders-list">
                {myOrders.map(o => (
                  <div key={o.id} className="profile-order-card glass">
                    <div className="profile-order-header">
                      <h4>{o.product_name}</h4>
                      <span className={`profile-order-status status-${o.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                        {o.status}
                      </span>
                    </div>
                    <div className="profile-order-details">
                      <span><strong>Date :</strong> {new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                      <span><strong>Montant :</strong> <span className="text-accent">{o.price}</span></span>
                      {o.custom_text && <span><strong>Flocage :</strong> {o.custom_text}</span>}
                      {o.size && <span><strong>Taille :</strong> {o.size}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export { PERMISSION_LABELS, ROLE_CONFIG }
