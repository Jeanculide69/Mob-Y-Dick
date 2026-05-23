import { useState } from 'react'
import { supabase } from '../supabaseClient'
import AvatarPicker from './AvatarPicker'
import TeamsManager from './TeamsManager'
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

const TABS = [
  { id: 'profile', icon: '👤', label: 'Profil' },
  { id: 'teams', icon: '👥', label: 'Ma Team' },
  { id: 'security', icon: '🔒', label: 'Sécurité' },
  { id: 'address', icon: '🏠', label: 'Adresse' },
  { id: 'orders', icon: '📦', label: 'Commandes' },
]

export default function ProfilePage({ session, profile, onLogout, orders = [], onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState('profile')
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [showAvatarModal, setShowAvatarModal] = useState(false)

  // Shipping Address States
  const [shippingAddress, setShippingAddress] = useState(profile?.shipping_address || '')
  const [shippingZip, setShippingZip] = useState(profile?.shipping_zip || '')
  const [shippingCity, setShippingCity] = useState(profile?.shipping_city || '')
  const [shippingCountry, setShippingCountry] = useState(profile?.shipping_country || 'France')
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressMsg, setAddressMsg] = useState(null)

  if (!session || !profile) return null

  const roleConfig = ROLE_CONFIG[profile.role] || ROLE_CONFIG.user
  const permissions = profile.permissions || []
  const myOrders = orders.filter(o => o.user_id === session.user.id)

  const handleSave = async () => {
    if (!displayName.trim()) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const { error } = await supabase.from('profiles').update({
        pending_display_name: displayName.trim(),
        display_name_status: 'pending'
      }).eq('id', session.user.id)

      if (error) throw error
      setSaveMsg('⏳ Demande envoyée à l\'administrateur !')
      setEditing(false)
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      setSaveMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddressSave = async (e) => {
    e.preventDefault()
    setSavingAddress(true)
    setAddressMsg(null)
    try {
      const { error } = await supabase.from('profiles').update({
        shipping_address: shippingAddress,
        shipping_zip: shippingZip,
        shipping_city: shippingCity,
        shipping_country: shippingCountry
      }).eq('id', session.user.id)

      if (error) throw error
      setAddressMsg('✅ Adresse sauvegardée avec succès !')
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      setAddressMsg('❌ ' + err.message)
    } finally {
      setSavingAddress(false)
    }
  }

  const handleResetPassword = async () => {
    if (!window.confirm("Envoyer un e-mail de réinitialisation de mot de passe ?")) return
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      alert("📧 Un e-mail de réinitialisation de mot de passe vous a été envoyé !")
    } catch (err) {
      alert("Erreur : " + err.message)
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
          {/* ─── Top Identity Card ─── */}
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
                <button
                  type="button"
                  className="profile-avatar-edit-btn"
                  onClick={() => setShowAvatarModal(true)}
                  aria-label="Modifier l'avatar"
                  title="Modifier l'avatar"
                >
                  ✏️
                </button>
                <span className="profile-role-dot" style={{ backgroundColor: roleConfig.color }} />
              </div>

              <div className="profile-info-main">
                {profile.display_name_changes >= 1 ? (
                  <div className="profile-name-row">
                    <h3 className="profile-display-name">{profile.display_name}</h3>
                    <span className="profile-lock-badge" title="Changement autorisé une seule fois">🔒 Pseudo verrouillé</span>
                  </div>
                ) : profile.display_name_status === 'pending' ? (
                  <div className="profile-name-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <h3 className="profile-display-name">{profile.display_name || session.user.email.split('@')[0]}</h3>
                    <span className="profile-pending-badge">⏳ En attente de validation : "{profile.pending_display_name}"</span>
                  </div>
                ) : editing ? (
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
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDisplayName(profile.display_name || '') }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="profile-name-row">
                    <h3 className="profile-display-name">{profile.display_name || session.user.email.split('@')[0]}</h3>
                    <button className="profile-edit-btn" onClick={() => setEditing(true)} title="Modifier le pseudo (1 fois max)">✏️</button>
                  </div>
                )}
                <p className="profile-email">{session.user.email}</p>

                {saveMsg && <div className="profile-save-msg">{saveMsg}</div>}

                <div className="profile-role-badge" style={{ borderColor: roleConfig.color, color: roleConfig.color }}>
                  {roleConfig.icon} {roleConfig.label}
                </div>

                <button className="btn btn-outline profile-logout-btn" onClick={onLogout}>
                  🚪 Déconnexion
                </button>
              </div>

              <div className="profile-meta-grid profile-meta-grid-top">
                <div className="profile-meta-item">
                  <span className="profile-meta-label">Inscrit le</span>
                  <span className="profile-meta-value">
                    {new Date(profile.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
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
            </div>
          </div>

          {/* ─── Tabs Navigation ─── */}
          <div className="profile-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`profile-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="profile-tab-icon">{tab.icon}</span>
                <span className="profile-tab-label">{tab.label}</span>
                {tab.id === 'orders' && myOrders.length > 0 && (
                  <span className="profile-tab-count">{myOrders.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ─── Tab Content ─── */}
          <div className="profile-tab-content">
            {activeTab === 'profile' && (
              <div className="profile-split-card glass">
                <h3 className="profile-section-title">🔧 Mes permissions</h3>
                {permissions.length > 0 ? (
                  <div className="profile-perm-grid">
                    {permissions.map(perm => (
                      <span key={perm} className="profile-perm-badge">
                        {PERMISSION_LABELS[perm]?.icon || '🔧'} {PERMISSION_LABELS[perm]?.label || perm}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                    Tu n'as pas de permissions spéciales attribuées pour le moment.
                    Si tu penses qu'il y a une erreur, contacte un administrateur.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'teams' && (
              <div className="profile-split-card glass">
                <h3 className="profile-section-title">👥 Ma Team</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.5' }}>
                  Crée une team privée pour suivre les courses avec tes potes : chat dédié pendant le live + annonces vocales lues à voix haute pour ta team seulement.
                </p>
                <TeamsManager session={session} />
              </div>
            )}

            {activeTab === 'security' && (
              <div className="profile-split-card glass">
                <h3 className="profile-section-title">🔒 Sécurité & Connexion</h3>
                <p className="profile-security-desc" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  Vous pouvez réinitialiser ou modifier votre mot de passe à tout moment. Un lien de réinitialisation sécurisé vous sera instantanément envoyé par e-mail.
                </p>
                <button className="btn btn-outline" onClick={handleResetPassword} style={{ width: '100%', marginTop: '30px' }}>
                  📧 Envoyer un e-mail de réinitialisation
                </button>
              </div>
            )}

            {activeTab === 'address' && (
              <div className="profile-split-card glass">
                <h3 className="profile-section-title">🏠 Adresse de livraison</h3>
                <form onSubmit={handleAddressSave} className="profile-address-form">
                  <div className="profile-form-group">
                    <label>Rue & Numéro</label>
                    <input
                      type="text"
                      value={shippingAddress}
                      onChange={e => setShippingAddress(e.target.value)}
                      placeholder="12 rue de la Paix"
                    />
                  </div>
                  <div className="profile-form-row">
                    <div className="profile-form-group" style={{ flex: 1 }}>
                      <label>Code Postal</label>
                      <input
                        type="text"
                        value={shippingZip}
                        onChange={e => setShippingZip(e.target.value)}
                        placeholder="75001"
                      />
                    </div>
                    <div className="profile-form-group" style={{ flex: 2 }}>
                      <label>Ville</label>
                      <input
                        type="text"
                        value={shippingCity}
                        onChange={e => setShippingCity(e.target.value)}
                        placeholder="Paris"
                      />
                    </div>
                  </div>
                  <div className="profile-form-group">
                    <label>Pays</label>
                    <input
                      type="text"
                      value={shippingCountry}
                      onChange={e => setShippingCountry(e.target.value)}
                      placeholder="France"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingAddress} style={{ marginTop: '10px' }}>
                    {savingAddress ? 'Enregistrement...' : '💾 Sauvegarder mon adresse'}
                  </button>
                  {addressMsg && <div className="profile-address-msg" style={{ marginTop: '10px', fontSize: '0.85rem' }}>{addressMsg}</div>}
                </form>
              </div>
            )}

            {activeTab === 'orders' && (
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
            )}
          </div>
        </div>

        {/* ─── Avatar Picker Modal ─── */}
        {showAvatarModal && (
          <div
            className="profile-modal-overlay"
            onClick={() => setShowAvatarModal(false)}
          >
            <div
              className="profile-modal glass"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="avatar-modal-title"
            >
              <div className="profile-modal-header">
                <h3 id="avatar-modal-title">🎨 Choisir mon avatar</h3>
                <button
                  type="button"
                  className="profile-modal-close"
                  onClick={() => setShowAvatarModal(false)}
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
              <div className="profile-modal-body">
                <AvatarPicker
                  session={session}
                  profile={profile}
                  onUpdated={onProfileUpdate}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export { PERMISSION_LABELS, ROLE_CONFIG }
