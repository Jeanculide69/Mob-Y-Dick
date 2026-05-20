import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './Admin.css'

const SITE_VERSION = 'v2.0.0'

export { SITE_VERSION }

export default function AdminPanel({ onClose }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [activeSection, setActiveSection] = useState('events')
  const [loading, setLoading] = useState(false)

  // Data
  const [events, setEvents] = useState([])
  const [gallery, setGallery] = useState([])
  const [products, setProducts] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [settings, setSettings] = useState({})
  const [affiliations, setAffiliations] = useState([])
  const [affiliationsLoading, setAffiliationsLoading] = useState(false)

  // Forms
  const [eventForm, setEventForm] = useState({ title: '', date: '', location: '', description: '' })
  const [editingEvent, setEditingEvent] = useState(null)

  const [galleryForm, setGalleryForm] = useState({ title: '', type: 'photo', source: 'upload', file: null, embed_url: '' })
  const [uploading, setUploading] = useState(false)

  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', url: '', image_url: '' })
  const [editingProduct, setEditingProduct] = useState(null)

  const [teamForm, setTeamForm] = useState({ name: '', image_url: '' })

  const [socialForm, setSocialForm] = useState({ instagram: '', facebook: '', tiktok: '', youtube: '', snapchat: '' })

  useEffect(() => { checkSession() }, [])

  useEffect(() => {
    if (isLoggedIn) { fetchAll() }
  }, [isLoggedIn])

  useEffect(() => {
    if (isLoggedIn && activeSection === 'affiliations') fetchAffiliations()
  }, [isLoggedIn, activeSection])

  async function checkSession() {
    if (!supabase) return
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setIsLoggedIn(true)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    if (!supabase) { setLoginError('Supabase non configuré.'); return }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError('Email ou mot de passe incorrect.')
    else setIsLoggedIn(true)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
  }

  async function fetchAll() {
    setLoading(true)
    const [ev, gl, pr, tm, st] = await Promise.all([
      supabase.from('events').select('*').order('date', { ascending: true }),
      supabase.from('gallery').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('sort_order', { ascending: true }),
      supabase.from('team').select('*').order('sort_order', { ascending: true }),
      supabase.from('settings').select('*'),
    ])
    setEvents(ev.data || [])
    setGallery(gl.data || [])
    setProducts(pr.data || [])
    setTeamMembers(tm.data || [])
    // Convert settings array to object
    const s = {}
    ;(st.data || []).forEach(row => { s[row.key] = row.value })
    setSettings(s)
    setSocialForm({
      instagram: s.instagram || '', facebook: s.facebook || '',
      tiktok: s.tiktok || '', youtube: s.youtube || '', snapchat: s.snapchat || ''
    })
    setLoading(false)
  }

  // ─── Events CRUD ───
  async function saveEvent(e) {
    e.preventDefault()
    if (editingEvent) await supabase.from('events').update(eventForm).eq('id', editingEvent.id)
    else await supabase.from('events').insert([eventForm])
    setEventForm({ title: '', date: '', location: '', description: '' })
    setEditingEvent(null)
    fetchAll()
  }
  async function deleteEvent(id) {
    if (confirm('Supprimer cet événement ?')) { await supabase.from('events').delete().eq('id', id); fetchAll() }
  }

  // ─── Gallery CRUD ───
  async function uploadGalleryItem(e) {
    e.preventDefault()
    setUploading(true)

    if (galleryForm.source === 'embed') {
      await supabase.from('gallery').insert([{
        title: galleryForm.title, type: galleryForm.type,
        url: galleryForm.embed_url, file_name: '', source: 'embed'
      }])
    } else {
      if (!galleryForm.file) { setUploading(false); return }
      const file = galleryForm.file
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`
      const { error } = await supabase.storage.from('Gallery').upload(fileName, file)
      if (error) { alert('Erreur upload: ' + error.message); setUploading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('Gallery').getPublicUrl(fileName)
      await supabase.from('gallery').insert([{
        title: galleryForm.title, type: galleryForm.type,
        url: publicUrl, file_name: fileName, source: 'upload'
      }])
    }
    setGalleryForm({ title: '', type: 'photo', source: 'upload', file: null, embed_url: '' })
    setUploading(false)
    fetchAll()
  }
  async function deleteGalleryItem(item) {
    if (!confirm('Supprimer ?')) return
    if (item.source === 'upload' && item.file_name) await supabase.storage.from('Gallery').remove([item.file_name])
    await supabase.from('gallery').delete().eq('id', item.id)
    fetchAll()
  }

  // ─── Products CRUD ───
  async function saveProduct(e) {
    e.preventDefault()
    const data = { ...productForm, sort_order: products.length }
    if (editingProduct) await supabase.from('products').update(data).eq('id', editingProduct.id)
    else await supabase.from('products').insert([data])
    setProductForm({ name: '', description: '', price: '', url: '', image_url: '' })
    setEditingProduct(null)
    fetchAll()
  }
  async function deleteProduct(id) {
    if (confirm('Supprimer ce produit ?')) { await supabase.from('products').delete().eq('id', id); fetchAll() }
  }

  // ─── Team CRUD ───
  async function addTeamMember(e) {
    e.preventDefault()
    await supabase.from('team').insert([{ ...teamForm, sort_order: teamMembers.length }])
    setTeamForm({ name: '', image_url: '' })
    fetchAll()
  }
  async function deleteTeamMember(id) {
    if (confirm('Supprimer ce membre ?')) { await supabase.from('team').delete().eq('id', id); fetchAll() }
  }

  // ─── Settings ───
  // ─── Affiliations ───
  async function fetchAffiliations() {
    setAffiliationsLoading(true)
    const { data } = await supabase
      .from('moto_affiliations')
      .select('*, profiles(display_name, email)')
      .order('requested_at', { ascending: false })
    setAffiliations(data || [])
    setAffiliationsLoading(false)
  }

  async function reviewAffiliation(id, status) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('moto_affiliations').update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id,
    }).eq('id', id)
    fetchAffiliations()
  }

  async function saveSocials(e) {
    e.preventDefault()
    for (const [key, value] of Object.entries(socialForm)) {
      const { data: existing } = await supabase.from('settings').select('id').eq('key', key).single()
      if (existing) await supabase.from('settings').update({ value }).eq('key', key)
      else await supabase.from('settings').insert([{ key, value }])
    }
    alert('Réseaux sociaux mis à jour !')
    fetchAll()
  }

  // ─── Login Screen ───
  if (!isLoggedIn) {
    return (
      <div className="admin-overlay">
        <div className="admin-login glass">
          <button className="admin-close" onClick={onClose}>✕</button>
          <h2>🔐 Espace Admin</h2>
          <p>Connectez-vous pour gérer le contenu.</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {loginError && <p className="admin-error">{loginError}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Se connecter</button>
          </form>
          <p className="admin-version">{SITE_VERSION}</p>
        </div>
      </div>
    )
  }

  const pendingCount = affiliations.filter(a => a.status === 'pending').length

  const TABS = [
    { key: 'events', icon: '📅', label: 'Événements' },
    { key: 'gallery', icon: '📸', label: 'Galerie' },
    { key: 'products', icon: '🛍️', label: 'Boutique' },
    { key: 'team', icon: '👥', label: 'Équipe' },
    { key: 'socials', icon: '🔗', label: 'Réseaux' },
    { key: 'affiliations', icon: '🏍️', label: `Affiliations${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'settings', icon: '⚙️', label: 'Paramètres' },
  ]

  return (
    <div className="admin-overlay">
      <div className="admin-panel glass">
        <div className="admin-header">
          <h2>⚙️ Administration</h2>
          <div className="admin-header-actions">
            <span className="admin-version-badge">{SITE_VERSION}</span>
            <button className="btn btn-ghost" onClick={handleLogout}>Déconnexion</button>
            <button className="admin-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="admin-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`admin-tab ${activeSection === t.key ? 'active' : ''}`}
              onClick={() => setActiveSection(t.key)}>{t.icon} {t.label}</button>
          ))}
        </div>

        <div className="admin-body">
          {loading && <p className="admin-loading">Chargement...</p>}

          {/* ─── EVENTS ─── */}
          {activeSection === 'events' && (
            <>
              <form className="admin-form" onSubmit={saveEvent}>
                <h3>{editingEvent ? '✏️ Modifier' : '➕ Nouvel événement'}</h3>
                <input type="text" placeholder="Titre" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} required />
                <input type="date" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} required />
                <input type="text" placeholder="Lieu" value={eventForm.location} onChange={e => setEventForm({...eventForm, location: e.target.value})} required />
                <textarea placeholder="Description" value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} rows={3} />
                <div className="admin-form-actions">
                  <button type="submit" className="btn btn-primary">{editingEvent ? 'Enregistrer' : 'Ajouter'}</button>
                  {editingEvent && <button type="button" className="btn btn-ghost" onClick={() => { setEditingEvent(null); setEventForm({ title:'', date:'', location:'', description:'' }) }}>Annuler</button>}
                </div>
              </form>
              <div className="admin-list">
                <h3>Événements ({events.length})</h3>
                {events.map(ev => (
                  <div key={ev.id} className="admin-list-item">
                    <div><strong>{ev.title}</strong><span className="admin-date">{new Date(ev.date).toLocaleDateString('fr-FR')}</span><span className="admin-location">📍 {ev.location}</span></div>
                    <div className="admin-item-actions">
                      <button onClick={() => { setEditingEvent(ev); setEventForm({ title: ev.title, date: ev.date, location: ev.location, description: ev.description }) }}>✏️</button>
                      <button onClick={() => deleteEvent(ev.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── GALLERY ─── */}
          {activeSection === 'gallery' && (
            <>
              <form className="admin-form" onSubmit={uploadGalleryItem}>
                <h3>➕ Ajouter du contenu</h3>
                <input type="text" placeholder="Titre" value={galleryForm.title} onChange={e => setGalleryForm({...galleryForm, title: e.target.value})} required />
                <div className="admin-row">
                  <select value={galleryForm.type} onChange={e => setGalleryForm({...galleryForm, type: e.target.value})}>
                    <option value="photo">📸 Photo</option>
                    <option value="video">🎥 Vidéo</option>
                  </select>
                  <select value={galleryForm.source} onChange={e => setGalleryForm({...galleryForm, source: e.target.value})}>
                    <option value="upload">📁 Importer un fichier</option>
                    <option value="embed">🔗 Lien externe (YouTube, Insta...)</option>
                  </select>
                </div>
                {galleryForm.source === 'upload' ? (
                  <input type="file" accept="image/*,video/*" onChange={e => setGalleryForm({...galleryForm, file: e.target.files[0]})} required />
                ) : (
                  <input type="url" placeholder="https://www.youtube.com/watch?v=... ou https://www.instagram.com/p/..." value={galleryForm.embed_url} onChange={e => setGalleryForm({...galleryForm, embed_url: e.target.value})} required />
                )}
                <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? 'Upload...' : 'Ajouter'}</button>
              </form>
              <div className="admin-list">
                <h3>Galerie ({gallery.length})</h3>
                {gallery.map(item => (
                  <div key={item.id} className="admin-list-item">
                    <div className="admin-gallery-item">
                      {item.type === 'photo' && item.source !== 'embed' ? <img src={item.url} alt="" className="admin-thumb" /> : <span className="admin-video-icon">{item.type === 'photo' ? '📸' : '🎥'}</span>}
                      <div><strong>{item.title}</strong><span className="admin-type">{item.source === 'embed' ? '🔗 Embed' : '📁 Upload'}</span></div>
                    </div>
                    <div className="admin-item-actions"><button onClick={() => deleteGalleryItem(item)}>🗑️</button></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── PRODUCTS ─── */}
          {activeSection === 'products' && (
            <>
              <form className="admin-form" onSubmit={saveProduct}>
                <h3>{editingProduct ? '✏️ Modifier' : '➕ Nouveau produit'}</h3>
                <input type="text" placeholder="Nom du produit" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} required />
                <textarea placeholder="Description" value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} rows={2} />
                <div className="admin-row">
                  <input type="text" placeholder="Prix (ex: 35€)" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} required />
                  <input type="url" placeholder="Lien BigCartel" value={productForm.url} onChange={e => setProductForm({...productForm, url: e.target.value})} required />
                </div>
                <input type="url" placeholder="URL image (optionnel)" value={productForm.image_url} onChange={e => setProductForm({...productForm, image_url: e.target.value})} />
                <div className="admin-form-actions">
                  <button type="submit" className="btn btn-primary">{editingProduct ? 'Enregistrer' : 'Ajouter'}</button>
                  {editingProduct && <button type="button" className="btn btn-ghost" onClick={() => { setEditingProduct(null); setProductForm({ name:'', description:'', price:'', url:'', image_url:'' }) }}>Annuler</button>}
                </div>
              </form>
              <div className="admin-list">
                <h3>Produits ({products.length})</h3>
                {products.map(p => (
                  <div key={p.id} className="admin-list-item">
                    <div><strong>{p.name}</strong><span className="admin-date">{p.price}</span></div>
                    <div className="admin-item-actions">
                      <button onClick={() => { setEditingProduct(p); setProductForm({ name: p.name, description: p.description, price: p.price, url: p.url, image_url: p.image_url || '' }) }}>✏️</button>
                      <button onClick={() => deleteProduct(p.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── TEAM ─── */}
          {activeSection === 'team' && (
            <>
              <form className="admin-form" onSubmit={addTeamMember}>
                <h3>➕ Ajouter un membre</h3>
                <input type="text" placeholder="Pseudo" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} required />
                <input type="url" placeholder="URL de la photo" value={teamForm.image_url} onChange={e => setTeamForm({...teamForm, image_url: e.target.value})} />
                <button type="submit" className="btn btn-primary">Ajouter</button>
              </form>
              <div className="admin-list">
                <h3>Membres ({teamMembers.length})</h3>
                {teamMembers.map(m => (
                  <div key={m.id} className="admin-list-item">
                    <div className="admin-gallery-item">
                      {m.image_url ? <img src={m.image_url} alt="" className="admin-thumb" /> : <span className="admin-video-icon">👤</span>}
                      <strong>{m.name}</strong>
                    </div>
                    <div className="admin-item-actions"><button onClick={() => deleteTeamMember(m.id)}>🗑️</button></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── SOCIALS ─── */}
          {activeSection === 'socials' && (
            <form className="admin-form" onSubmit={saveSocials}>
              <h3>🔗 Liens réseaux sociaux</h3>
              <p className="admin-hint">Ces liens apparaîtront dans le footer du site.</p>
              <label className="admin-label">Instagram</label>
              <input type="url" placeholder="https://instagram.com/..." value={socialForm.instagram} onChange={e => setSocialForm({...socialForm, instagram: e.target.value})} />
              <label className="admin-label">Facebook</label>
              <input type="url" placeholder="https://facebook.com/..." value={socialForm.facebook} onChange={e => setSocialForm({...socialForm, facebook: e.target.value})} />
              <label className="admin-label">TikTok</label>
              <input type="url" placeholder="https://tiktok.com/@..." value={socialForm.tiktok} onChange={e => setSocialForm({...socialForm, tiktok: e.target.value})} />
              <label className="admin-label">YouTube</label>
              <input type="url" placeholder="https://youtube.com/..." value={socialForm.youtube} onChange={e => setSocialForm({...socialForm, youtube: e.target.value})} />
              <label className="admin-label">Snapchat</label>
              <input type="url" placeholder="https://snapchat.com/..." value={socialForm.snapchat} onChange={e => setSocialForm({...socialForm, snapchat: e.target.value})} />
              <button type="submit" className="btn btn-primary" style={{marginTop:'12px'}}>Enregistrer</button>
            </form>
          )}

          {/* ─── AFFILIATIONS ─── */}
          {activeSection === 'affiliations' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>🏍️ Demandes d'affiliation aux motos</h3>
                <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={fetchAffiliations}>↻ Actualiser</button>
              </div>

              {affiliationsLoading && <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>}

              {!affiliationsLoading && affiliations.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                  Aucune demande d'affiliation pour le moment.
                </p>
              )}

              {/* Pending first */}
              {['pending', 'approved', 'rejected'].map(statusGroup => {
                const group = affiliations.filter(a => a.status === statusGroup)
                if (group.length === 0) return null
                const labels = { pending: '⏳ En attente', approved: '✅ Approuvées', rejected: '❌ Refusées' }
                return (
                  <div key={statusGroup} style={{ marginBottom: '24px' }}>
                    <h4 style={{
                      margin: '0 0 10px',
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '1.5px',
                      color: statusGroup === 'pending' ? '#ffaa00' : statusGroup === 'approved' ? '#00cc66' : '#ff6666',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      paddingBottom: '8px',
                    }}>
                      {labels[statusGroup]} ({group.length})
                    </h4>
                    {group.map(aff => {
                      const userName = aff.profiles?.display_name || aff.profiles?.email || aff.user_id.slice(0, 8) + '…'
                      return (
                        <div key={aff.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '14px 16px',
                          marginBottom: '8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '12px',
                          flexWrap: 'wrap',
                        }}>
                          {/* Moto number plate */}
                          <div style={{
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                            color: '#fff',
                            fontWeight: '900',
                            fontSize: '1.1rem',
                            fontFamily: 'var(--font-heading)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            letterSpacing: '1px',
                            flexShrink: 0,
                          }}>
                            #{aff.moto_number}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: '140px' }}>
                            <div style={{ fontWeight: '600', color: '#fff', fontSize: '0.9rem' }}>{userName}</div>
                            {aff.note && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }}>
                                « {aff.note} »
                              </div>
                            )}
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {new Date(aff.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                          </div>

                          {/* Actions */}
                          {statusGroup === 'pending' && (
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button
                                className="btn btn-primary"
                                style={{ padding: '7px 14px', fontSize: '0.8rem', background: 'linear-gradient(135deg,#00cc66,#009944)', boxShadow: 'none' }}
                                onClick={() => reviewAffiliation(aff.id, 'approved')}
                              >
                                ✅ Approuver
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '7px 14px', fontSize: '0.8rem', borderColor: '#ff4444', color: '#ff4444' }}
                                onClick={() => reviewAffiliation(aff.id, 'rejected')}
                              >
                                ❌ Refuser
                              </button>
                            </div>
                          )}

                          {statusGroup === 'approved' && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: '#ff4444', color: '#ff4444', flexShrink: 0 }}
                              onClick={() => reviewAffiliation(aff.id, 'rejected')}
                            >
                              Révoquer
                            </button>
                          )}

                          {statusGroup === 'rejected' && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: '#00cc66', color: '#00cc66', flexShrink: 0 }}
                              onClick={() => reviewAffiliation(aff.id, 'approved')}
                            >
                              Réapprouver
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── SETTINGS ─── */}
          {activeSection === 'settings' && (
            <div className="admin-form">
              <h3>⚙️ Paramètres</h3>
              <div className="admin-settings-info">
                <p><strong>Version du site :</strong> {SITE_VERSION}</p>
                <p><strong>Événements :</strong> {events.length}</p>
                <p><strong>Galerie :</strong> {gallery.length} éléments</p>
                <p><strong>Produits :</strong> {products.length}</p>
                <p><strong>Membres :</strong> {teamMembers.length}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
