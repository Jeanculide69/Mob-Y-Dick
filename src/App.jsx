import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const SITE_VERSION = 'v1.3.0'

const TEAM = [
  { name: 'Alex', img: '/team/alex.png' },
  { name: 'Bob', img: '/team/bob.png' },
  { name: 'Fumax', img: '/team/fumax.png' },
  { name: 'Gauthier', img: '/team/gauthier.png' },
  { name: 'MadMat', img: '/team/madmat.png' },
  { name: 'StickMan', img: '/team/stickman.png' },
  { name: 'Flo', img: '/team/flo.png' },
  { name: 'JeanCulide', img: '/team/jeanculide.png' },
]

const EVENTS = [
  { title: 'Expo Éphémère', date: '2026-06-12', location: 'Lieu à définir', desc: 'Retrouvez nos dernières toiles et personnalisations en direct.' },
  { title: 'Ride & Graffiti', date: '2026-07-20', location: 'Lieu à définir', desc: 'Session mob, peinture et bon son. Ouvert à tous.' },
]

const PRODUCTS = [
  { name: 'T-Shirt Custom', price: '35€', desc: 'Ton pseudo en style graffiti sur coton premium.', url: 'https://paypal.me/CorentinCARTIER', status: 'En stock', is_visible: true },
  { name: 'Sweat à Capuche', price: '55€', desc: 'Hoodie noir avec le logo Mob Y Dick brodé.', url: 'https://paypal.me/CorentinCARTIER', status: 'Coming soon', is_visible: true },
  { name: 'Toile Originale', price: '120€', desc: 'Pièce unique peinte à la main par l\'équipe.', url: 'https://paypal.me/CorentinCARTIER', status: 'Sur commande', is_visible: true },
  { name: 'Stickers Pack', price: '8€', desc: 'Lot de 5 stickers vinyle haute qualité.', url: 'https://paypal.me/CorentinCARTIER', status: 'En stock', is_visible: true },
]

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  // Database Data States
  const [dbEvents, setDbEvents] = useState(null)
  const [dbGallery, setDbGallery] = useState(null)
  const [dbProducts, setDbProducts] = useState(null)
  const [dbTeam, setDbTeam] = useState(null)
  const [dbSettings, setDbSettings] = useState({})
  const [dbOrders, setDbOrders] = useState([])

  // Form Modal States (Admin)
  const [activeForm, setActiveForm] = useState(null) // 'event' | 'gallery' | 'product' | 'team' | 'socials' | 'orders'
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({})
  const [uploading, setUploading] = useState(false)

  // Checkout Modal States (Client)
  const [checkoutProduct, setCheckoutProduct] = useState(null)
  const [checkoutStep, setCheckoutStep] = useState(1) // 1: Personalization, 2: Shipping, 3: Validation, 4: Redirection
  const [checkoutData, setCheckoutData] = useState({
    customText: '',
    size: 'M',
    customerName: '',
    customerEmail: '',
    shippingAddress: '',
    shippingCity: '',
    shippingZip: '',
    shippingCountry: 'France'
  })

  // Load and refresh data
  const refreshData = () => {
    if (supabase) {
      supabase.from('events').select('*').order('date', { ascending: true })
        .then(({ data }) => { if (data) setDbEvents(data) })
      supabase.from('gallery').select('*').order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setDbGallery(data) })
      supabase.from('products').select('*').order('sort_order', { ascending: true })
        .then(({ data }) => { if (data) setDbProducts(data) })
      supabase.from('team').select('*').order('sort_order', { ascending: true })
        .then(({ data }) => { if (data) setDbTeam(data) })
      supabase.from('settings').select('*')
        .then(({ data }) => {
          if (data) {
            const s = {}
            data.forEach(row => { s[row.key] = row.value })
            setDbSettings(s)
          }
        })
      // Only fetch orders if logged in
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          supabase.from('orders').select('*').order('created_at', { ascending: false })
            .then(({ data }) => { if (data) setDbOrders(data) })
        }
      })
    }
  }

  // Check Supabase Auth session on mount
  useEffect(() => {
    refreshData()
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setIsAdmin(true)
      })
    }
  }, [isAdmin])

  const displayEvents = dbEvents || EVENTS.map((e, i) => ({ ...e, id: i }))
  const displayGallery = dbGallery
  const displayProducts = dbProducts || PRODUCTS
  const displayTeam = dbTeam || TEAM

  // Filter products for the public (admins see hidden ones styled with low opacity)
  const visibleProducts = isAdmin 
    ? displayProducts 
    : displayProducts.filter(p => p.is_visible !== false)

  const navigate = (tab) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ─── Authentication Handlers ───
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setLoginError('')
    if (!supabase) { setLoginError('Supabase non configuré.'); return }
    const { error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    if (error) {
      setLoginError('Email ou mot de passe incorrect.')
    } else {
      setIsAdmin(true)
      setShowLoginModal(false)
      setAdminEmail('')
      setAdminPassword('')
      refreshData()
    }
  }

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    setIsAdmin(false)
    setDbOrders([])
  }

  // ─── Inline CRUD Handlers ───
  const handleDeleteItem = async (table, id, item = null) => {
    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return
    try {
      if (table === 'gallery' && item && item.source === 'upload' && item.file_name) {
        await supabase.storage.from('gallery').remove([item.file_name])
      }
      await supabase.from(table).delete().eq('id', id)
      refreshData()
    } catch (err) {
      alert('Erreur de suppression: ' + err.message)
    }
  }

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
      refreshData()
    } catch (err) {
      alert('Erreur: ' + err.message)
    }
  }

  const handleOpenForm = (type, item = null) => {
    setActiveForm(type)
    setEditingItem(item)
    if (type === 'event') {
      setFormData(item ? { title: item.title, date: item.date, location: item.location, description: item.description } : { title: '', date: '', location: '', description: '' })
    } else if (type === 'gallery') {
      setFormData({ title: '', type: 'photo', source: 'upload', file: null, embed_url: '' })
    } else if (type === 'product') {
      setFormData(item ? { 
        name: item.name, 
        description: item.description, 
        price: item.price, 
        url: item.url, 
        image_url: item.image_url || '',
        status: item.status || 'Coming soon',
        is_visible: item.is_visible !== undefined ? item.is_visible : true
      } : { 
        name: '', 
        description: '', 
        price: '', 
        url: '', 
        image_url: '',
        status: 'Coming soon',
        is_visible: true
      })
    } else if (type === 'team') {
      setFormData(item ? { name: item.name, image_url: item.image_url || '' } : { name: '', image_url: '' })
    } else if (type === 'socials') {
      setFormData({
        instagram: dbSettings.instagram || '',
        facebook: dbSettings.facebook || '',
        tiktok: dbSettings.tiktok || '',
        youtube: dbSettings.youtube || '',
        snapchat: dbSettings.snapchat || ''
      })
    }
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    setUploading(true)
    try {
      if (activeForm === 'event') {
        if (editingItem) {
          await supabase.from('events').update(formData).eq('id', editingItem.id)
        } else {
          await supabase.from('events').insert([formData])
        }
      } else if (activeForm === 'gallery') {
        if (formData.source === 'embed') {
          await supabase.from('gallery').insert([{
            title: formData.title, type: formData.type,
            url: formData.embed_url, file_name: '', source: 'embed'
          }])
        } else {
          if (!formData.file) { alert('Veuillez sélectionner un fichier.'); setUploading(false); return }
          const file = formData.file
          const fileName = `${Date.now()}.${file.name.split('.').pop()}`
          const { error } = await supabase.storage.from('gallery').upload(fileName, file)
          if (error) throw error
          const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(fileName)
          await supabase.from('gallery').insert([{
            title: formData.title, type: formData.type,
            url: publicUrl, file_name: fileName, source: 'upload'
          }])
        }
      } else if (activeForm === 'product') {
        const productData = { ...formData, sort_order: editingItem ? editingItem.sort_order : (dbProducts?.length || 0) }
        if (editingItem) {
          await supabase.from('products').update(productData).eq('id', editingItem.id)
        } else {
          await supabase.from('products').insert([productData])
        }
      } else if (activeForm === 'team') {
        const teamData = { ...formData, sort_order: editingItem ? editingItem.sort_order : (dbTeam?.length || 0) }
        if (editingItem) {
          await supabase.from('team').update(teamData).eq('id', editingItem.id)
        } else {
          await supabase.from('team').insert([teamData])
        }
      } else if (activeForm === 'socials') {
        for (const [key, value] of Object.entries(formData)) {
          const { data: existing } = await supabase.from('settings').select('id').eq('key', key).single()
          if (existing) await supabase.from('settings').update({ value }).eq('key', key)
          else await supabase.from('settings').insert([{ key, value }])
        }
      }
      setActiveForm(null)
      setEditingItem(null)
      refreshData()
    } catch (err) {
      alert('Erreur lors de la sauvegarde: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // ─── Client Ordering Handlers ───
  const handleOpenCheckout = (product) => {
    if (product.status === 'Coming soon' || product.status === 'Rupture de stock') return
    setCheckoutProduct(product)
    setCheckoutStep(1)
    setCheckoutData({
      customText: '',
      size: product.name.toLowerCase().includes('shirt') || product.name.toLowerCase().includes('sweat') || product.name.toLowerCase().includes('hoodie') ? 'M' : '',
      customerName: '',
      customerEmail: '',
      shippingAddress: '',
      shippingCity: '',
      shippingZip: '',
      shippingCountry: 'France'
    })
  }

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault()
    if (checkoutStep < 3) {
      setCheckoutStep(checkoutStep + 1)
      return
    }
    
    // Save to Database (Step 3 to 4)
    try {
      const orderPayload = {
        product_name: checkoutProduct.name,
        price: checkoutProduct.price,
        custom_text: checkoutData.customText,
        size: checkoutData.size,
        customer_name: checkoutData.customerName,
        customer_email: checkoutData.customerEmail,
        shipping_address: checkoutData.shippingAddress,
        shipping_city: checkoutData.shippingCity,
        shipping_zip: checkoutData.shippingZip,
        shipping_country: checkoutData.shippingCountry,
        status: 'En attente de paiement'
      }
      
      const { error } = await supabase.from('orders').insert([orderPayload])
      if (error) throw error
      setCheckoutStep(4)
    } catch (err) {
      alert('Erreur lors de l\'enregistrement de votre commande. Veuillez réessayer: ' + err.message)
    }
  }

  return (
    <>
      {/* ─── Video Background ─── */}
      <div className="video-bg">
        <video autoPlay loop muted playsInline>
          <source src="/video_background.mp4" type="video/mp4" />
        </video>
        <div className="video-overlay" />
      </div>

      {/* ─── Sticky Admin Banner ─── */}
      {isAdmin && (
        <div className="admin-banner glass">
          <div className="admin-banner-inner container">
            <span>🛠️ <strong>Mode Édition Actif</strong> — Modifiez le contenu directement sur vos pages !</span>
            <div className="admin-banner-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => handleOpenForm('orders')}>
                📦 Commandes {dbOrders.filter(o => o.status === 'En attente de paiement').length > 0 && (
                  <span className="admin-banner-badge">{dbOrders.filter(o => o.status === 'En attente de paiement').length}</span>
                )}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleOpenForm('socials')}>🔗 Configurer Réseaux</button>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Déconnexion</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Navbar ─── */}
      <header className={`navbar glass ${isAdmin ? 'with-admin-banner' : ''}`}>
        <div className="container nav-inner">
          <button className="nav-brand" onClick={() => navigate('home')}>
            <img src="/logo.png" alt="Mob Y Dick" className="nav-logo" />
          </button>

          <button className="hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
            <span className={mobileMenuOpen ? 'bar open' : 'bar'} />
            <span className={mobileMenuOpen ? 'bar open' : 'bar'} />
            <span className={mobileMenuOpen ? 'bar open' : 'bar'} />
          </button>

          <nav className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
            {['home', 'gallery', 'events', 'shop', 'donate'].map((tab) => (
              <button
                key={tab}
                className={`nav-link ${activeTab === tab ? 'active' : ''} ${tab === 'donate' ? 'btn btn-primary nav-donate' : ''}`}
                onClick={() => navigate(tab)}
              >
                {tab === 'home' ? '🏠 Accueil' : tab === 'gallery' ? '📸 Galerie' : tab === 'events' ? '📅 Événements' : tab === 'shop' ? '🛒 Boutique' : '🧡 Faire un Don'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={isAdmin ? 'with-admin-banner' : ''}>
        {/* ─── HOME ─── */}
        {activeTab === 'home' && (
          <>
            <section className="hero">
              <div className="container hero-inner">
                <img src="/logo.png" alt="Mob Y Dick" className="hero-logo fade-in" />
                <h1 className="hero-title fade-in fade-in-delay-1">
                  MOBCROSS<br /><span className="text-accent">TEAM</span>
                </h1>
                <p className="hero-sub fade-in fade-in-delay-2">
                  Punk · Graffiti · 70cc · Boue · Passion
                </p>
                <div className="hero-btns fade-in fade-in-delay-3">
                  <button className="btn btn-primary" onClick={() => navigate('shop')}>Voir la Boutique</button>
                  <button className="btn btn-outline" onClick={() => navigate('events')}>Événements</button>
                </div>
              </div>
              <div className="hero-scroll-hint">
                <span>↓</span>
              </div>
            </section>

            {/* Team Section */}
            <section className="section">
              <div className="container">
                <div className="section-header">
                  <span className="section-tag">L'Équipe</span>
                  <h2>Les Riders</h2>
                  <p className="section-sub">Les personnalités qui font vivre Mob Y Dick.</p>
                  {isAdmin && (
                    <button className="btn btn-primary btn-sm inline-add-btn" onClick={() => handleOpenForm('team')}>
                      ➕ Ajouter un Rider
                    </button>
                  )}
                </div>
                <div className="team-grid">
                  {displayTeam.map((m, i) => (
                    <div key={m.id || m.name} className={`team-card fade-in fade-in-delay-${i % 4 + 1} admin-card-parent`}>
                      <div className="team-img-wrap">
                        {m.image_url || m.img ? (
                          <img src={m.image_url || m.img} alt={m.name} className="team-img" />
                        ) : (
                          <div className="team-placeholder-icon">👤</div>
                        )}
                      </div>
                      <h3 className="team-name">{m.name}</h3>

                      {isAdmin && m.id && (
                        <div className="admin-inline-actions">
                          <button onClick={() => handleOpenForm('team', m)}>✏️</button>
                          <button onClick={() => handleDeleteItem('team', m.id)}>🗑️</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ─── GALLERY ─── */}
        {activeTab === 'gallery' && (
          <section className="section page-top">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Galerie</span>
                <h2>Photos & Vidéos</h2>
                <p className="section-sub">Les meilleurs moments de la team Mob Y Dick.</p>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm inline-add-btn" onClick={() => handleOpenForm('gallery')}>
                    ➕ Ajouter une Photo/Vidéo
                  </button>
                )}
              </div>
              <div className="gallery-grid">
                {displayGallery && displayGallery.length > 0 ? (
                  displayGallery.map((item, i) => (
                    <div key={item.id} className={`gallery-item glass fade-in fade-in-delay-${i % 4 + 1} admin-card-parent`}>
                      {item.type === 'video' ? (
                        <video src={item.url} controls className="gallery-media" />
                      ) : (
                        <img src={item.url} alt={item.title} className="gallery-media" />
                      )}
                      <p>{item.title} <span className="gallery-media-source-tag">{item.source === 'embed' ? '🔗 Lien' : '📁 Upload'}</span></p>

                      {isAdmin && (
                        <div className="admin-inline-actions">
                          <button onClick={() => handleDeleteItem('gallery', item.id, item)}>🗑️ Supprimer</button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="gallery-empty">
                    <p>📸 Les photos et vidéos arrivent bientôt !</p>
                    <p>L'équipe prépare du contenu exclusif.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ─── EVENTS ─── */}
        {activeTab === 'events' && (
          <section className="section page-top">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Agenda</span>
                <h2>Événements à venir</h2>
                <p className="section-sub">Nos prochains rassemblements et expos.</p>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm inline-add-btn" onClick={() => handleOpenForm('event')}>
                    ➕ Ajouter un Événement
                  </button>
                )}
              </div>
              <div className="events-list">
                {displayEvents.map((ev, i) => {
                  const dateStr = ev.date || ''
                  const dateObj = new Date(dateStr)
                  const isValidDate = !isNaN(dateObj.getTime()) && dateStr.includes('-')
                  const day = isValidDate ? dateObj.getDate() : dateStr.split(' ')[0]
                  const month = isValidDate ? dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : dateStr.split(' ').slice(1).join(' ')
                  return (
                    <div key={ev.id || i} className={`event-row glass fade-in fade-in-delay-${(i % 4) + 1} admin-card-parent`}>
                      <div className="event-date-block">
                        <span className="event-day">{day}</span>
                        <span className="event-month">{month}</span>
                      </div>
                      <div className="event-info">
                        <h3>{ev.title}</h3>
                        <p className="event-location">📍 {ev.location}</p>
                        <p>{ev.description || ev.desc}</p>
                      </div>

                      {isAdmin && ev.id && (
                        <div className="admin-inline-actions">
                          <button onClick={() => handleOpenForm('event', ev)}>✏️ Modifier</button>
                          <button onClick={() => handleDeleteItem('events', ev.id)}>🗑️ Supprimer</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ─── SHOP ─── */}
        {activeTab === 'shop' && (
          <section className="section page-top">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Shop</span>
                <h2>Boutique Officielle</h2>
                <p className="section-sub">Toutes nos créations sont personnalisables à 100% avec ton propre pseudo graffiti.</p>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm inline-add-btn" onClick={() => handleOpenForm('product')}>
                    ➕ Ajouter un Produit
                  </button>
                )}
              </div>
              <div className="shop-grid">
                {visibleProducts.map((p, i) => {
                  const isHidden = p.is_visible === false
                  const status = p.status || 'Coming soon'
                  return (
                    <div key={p.id || i} className={`product-card glass fade-in fade-in-delay-${i % 4 + 1} admin-card-parent ${isHidden ? 'product-hidden-admin' : ''}`}>
                      
                      {/* Product Status Badge */}
                      <div className={`product-status-tag ${status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {status === 'Coming soon' && '🔮 Bientôt'}
                        {status === 'Rupture de stock' && '❌ Rupture'}
                        {status === 'Sur commande' && '⚡ Sur Commande'}
                        {status === 'En stock' && '✅ En Stock'}
                      </div>

                      {/* Admin Hidden Badge */}
                      {isAdmin && isHidden && (
                        <div className="product-hidden-badge">🚫 MASQUÉ DU PUBLIC</div>
                      )}

                      <div className="product-img" style={p.image_url ? { backgroundImage: `url(${p.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                        {!p.image_url && <div className="product-badge">Graffiti</div>}
                      </div>
                      <div className="product-body">
                        <h3>{p.name}</h3>
                        <p className="product-desc">{p.description || p.desc}</p>
                        <div className="product-footer">
                          <span className="product-price">{p.price}</span>
                          
                          {status === 'Coming soon' ? (
                            <button className="btn btn-ghost" disabled>Bientôt dispo</button>
                          ) : status === 'Rupture de stock' ? (
                            <button className="btn btn-ghost" disabled>En Rupture</button>
                          ) : (
                            <button className="btn btn-primary" onClick={() => handleOpenCheckout(p)}>Commander</button>
                          )}
                        </div>
                      </div>

                      {isAdmin && p.id && (
                        <div className="admin-inline-actions">
                          <button onClick={() => handleOpenForm('product', p)}>✏️</button>
                          <button onClick={() => handleDeleteItem('products', p.id)}>🗑️</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ─── DONATE ─── */}
        {activeTab === 'donate' && (
          <section className="section page-top donate-page">
            <div className="container">
              <div className="donate-wrapper fade-in">
                <div className="donate-card glass">
                  <div className="donate-icon">🧡</div>
                  <h2>Soutenez Mob Y Dick</h2>
                  <p>
                    Votre soutien nous permet d'acheter du matériel, des bombes de peinture,
                    d'entretenir nos bécanes et d'organiser des événements indépendants.
                  </p>
                  <p className="donate-secure">🔒 Paiement sécurisé via PayPal</p>
                  <div className="donate-amounts">
                    <button className="btn btn-ghost">5€</button>
                    <button className="btn btn-ghost">10€</button>
                    <button className="btn btn-ghost">25€</button>
                    <button className="btn btn-ghost">50€</button>
                  </div>
                  <a href="https://paypal.me/CorentinCARTIER" target="_blank" rel="noopener noreferrer" className="btn btn-primary donate-main-btn">
                    Faire un don via PayPal
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <img src="/logo.png" alt="Mob Y Dick" className="footer-logo" />
            <p>Mobcross Team — Punk & Graffiti since day one.</p>
          </div>
          <div className="footer-links">
            <h4>Navigation</h4>
            <button onClick={() => navigate('home')}>Accueil</button>
            <button onClick={() => navigate('events')}>Événements</button>
            <button onClick={() => navigate('shop')}>Boutique</button>
            <button onClick={() => navigate('donate')}>Faire un Don</button>
          </div>
          <div className="footer-links">
            <h4>Réseaux</h4>
            <a href={dbSettings.instagram || "https://instagram.com"} target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href={dbSettings.facebook || "https://facebook.com"} target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href={dbSettings.tiktok || "https://tiktok.com"} target="_blank" rel="noopener noreferrer">TikTok</a>
            {dbSettings.youtube && <a href={dbSettings.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
            {dbSettings.snapchat && <a href={dbSettings.snapchat} target="_blank" rel="noopener noreferrer">Snapchat</a>}
          </div>
        </div>
        <div className="footer-bottom container">
          <p>&copy; 2026 Mob Y Dick. Tous droits réservés. <span className="site-version">{SITE_VERSION}</span></p>
          <button className="admin-trigger" onClick={() => {
            if (isAdmin) {
              handleOpenForm('orders')
            } else {
              setShowLoginModal(true)
            }
          }}>{isAdmin ? '📦 Gérer Commandes' : '⚙️ Admin'}</button>
        </div>
      </footer>

      {/* ─── Login Modal ─── */}
      {showLoginModal && (
        <div className="admin-overlay">
          <div className="admin-login glass">
            <button className="admin-close" onClick={() => setShowLoginModal(false)}>✕</button>
            <h2>🔐 Espace Admin</h2>
            <p>Connectez-vous pour activer l'édition visuelle.</p>
            <form onSubmit={handleLoginSubmit}>
              <input type="email" placeholder="Email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
              <input type="password" placeholder="Mot de passe" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
              {loginError && <p className="admin-error">{loginError}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Se connecter</button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Client Checkout Modal (Step by Step) ─── */}
      {checkoutProduct && (
        <div className="admin-overlay">
          <div className="admin-panel glass checkout-modal admin-visual-modal">
            <div className="admin-header">
              <h2>🛒 Personnaliser ton objet</h2>
              <button className="admin-close" onClick={() => setCheckoutProduct(null)}>✕</button>
            </div>
            
            {/* Step Indicators */}
            {checkoutStep < 4 && (
              <div className="checkout-steps-indicator">
                <span className={checkoutStep === 1 ? 'active' : ''}>1. Design</span>
                <span className={checkoutStep === 2 ? 'active' : ''}>2. Livraison</span>
                <span className={checkoutStep === 3 ? 'active' : ''}>3. Récap</span>
              </div>
            )}

            <form onSubmit={handleCheckoutSubmit} className="admin-form">
              {/* STEP 1: Personalization */}
              {checkoutStep === 1 && (
                <div className="checkout-step-container">
                  <h3>T-Shirt / Objet : <span className="text-accent">{checkoutProduct.name}</span></h3>
                  
                  <label className="admin-label">✏️ Écris ton Pseudo Graffiti à imprimer :</label>
                  <input type="text" placeholder="Ex: FLO, FUMAX, ALEX..." value={checkoutData.customText} onChange={e => setCheckoutData({...checkoutData, customText: e.target.value})} required maxLength={20} className="checkout-large-input" />
                  
                  {checkoutData.size !== '' && (
                    <>
                      <label className="admin-label" style={{marginTop:'16px'}}>👚 Choisis ta taille :</label>
                      <select value={checkoutData.size} onChange={e => setCheckoutData({...checkoutData, size: e.target.value})} className="checkout-select">
                        <option value="XS">XS</option>
                        <option value="S">S</option>
                        <option value="M">M</option>
                        <option value="L">L</option>
                        <option value="XL">XL</option>
                        <option value="XXL">XXL</option>
                      </select>
                    </>
                  )}
                  
                  <button type="submit" className="btn btn-primary" style={{width:'100%', marginTop:'24px'}}>Étape Suivante ➔</button>
                </div>
              )}

              {/* STEP 2: Shipping Address */}
              {checkoutStep === 2 && (
                <div className="checkout-step-container">
                  <h3>📍 Adresse de Livraison</h3>
                  
                  <input type="text" placeholder="Nom et Prénom complet" value={checkoutData.customerName} onChange={e => setCheckoutData({...checkoutData, customerName: e.target.value})} required />
                  <input type="email" placeholder="Adresse email de contact" value={checkoutData.customerEmail} onChange={e => setCheckoutData({...checkoutData, customerEmail: e.target.value})} required />
                  <input type="text" placeholder="Adresse (N°, rue, appartement...)" value={checkoutData.shippingAddress} onChange={e => setCheckoutData({...checkoutData, shippingAddress: e.target.value})} required />
                  
                  <div className="admin-row">
                    <input type="text" placeholder="Code Postal" value={checkoutData.shippingZip} onChange={e => setCheckoutData({...checkoutData, shippingZip: e.target.value})} required />
                    <input type="text" placeholder="Ville" value={checkoutData.shippingCity} onChange={e => setCheckoutData({...checkoutData, shippingCity: e.target.value})} required />
                  </div>
                  
                  <input type="text" placeholder="Pays" value={checkoutData.shippingCountry} onChange={e => setCheckoutData({...checkoutData, shippingCountry: e.target.value})} required />
                  
                  <div className="admin-row" style={{marginTop:'16px'}}>
                    <button type="button" className="btn btn-ghost" onClick={() => setCheckoutStep(1)}>⬅ Retour</button>
                    <button type="submit" className="btn btn-primary">Étape Suivante ➔</button>
                  </div>
                </div>
              )}

              {/* STEP 3: Review Details */}
              {checkoutStep === 3 && (
                <div className="checkout-step-container">
                  <h3>🔍 Valider ton récapitulatif</h3>
                  
                  <div className="checkout-summary-box glass">
                    <p><strong>Objet :</strong> {checkoutProduct.name} ({checkoutProduct.price})</p>
                    <p><strong>Pseudo Graffiti :</strong> <span className="checkout-graffiti-badge">{checkoutData.customText}</span></p>
                    {checkoutData.size && <p><strong>Taille :</strong> {checkoutData.size}</p>}
                    <hr style={{borderColor:'rgba(255,85,0,0.2)', margin:'10px 0'}} />
                    <p><strong>Destinataire :</strong> {checkoutData.customerName}</p>
                    <p><strong>Contact :</strong> {checkoutData.customerEmail}</p>
                    <p><strong>Adresse :</strong> {checkoutData.shippingAddress}, {checkoutData.shippingZip} {checkoutData.shippingCity}, {checkoutData.shippingCountry}</p>
                  </div>
                  
                  <p className="checkout-warning-text">⚠️ En cliquant sur valider, votre commande sera enregistrée. Vous procéderez ensuite au règlement sécurisé sur PayPal.</p>

                  <div className="admin-row" style={{marginTop:'16px'}}>
                    <button type="button" className="btn btn-ghost" onClick={() => setCheckoutStep(2)}>⬅ Retour</button>
                    <button type="submit" className="btn btn-primary">Valider et Payer ➔</button>
                  </div>
                </div>
              )}

              {/* STEP 4: PayPal Redirection */}
              {checkoutStep === 4 && (
                <div className="checkout-step-container text-center" style={{textAlign:'center'}}>
                  <span style={{fontSize:'3rem'}}>🎉</span>
                  <h3 style={{margin:'10px 0'}}>Commande Pré-Enregistrée !</h3>
                  <p style={{color:'var(--text-secondary)', fontSize:'0.95rem', marginBottom:'20px'}}>
                    Nous avons bien enregistré ta commande pour le pseudo <strong className="text-accent">{checkoutData.customText}</strong>.
                    <br /><br />
                    Pour finaliser l'achat et lancer la production, merci d'effectuer le paiement de <strong>{checkoutProduct.price}</strong> via PayPal.
                  </p>
                  
                  <a href={`${checkoutProduct.url || 'https://paypal.me/CorentinCARTIER'}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary checkout-paypal-btn" onClick={() => setCheckoutProduct(null)}>
                    💰 Payer {checkoutProduct.price} via PayPal
                  </a>
                  
                  <p className="checkout-hint" style={{marginTop:'16px', fontSize:'0.8rem', color:'var(--text-muted)'}}>
                    Dès confirmation de ton paiement par notre équipe, ta commande passera en fabrication sur Printful ! Merci du soutien !
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ─── Sleek Dynamic Forms and Lists Modal (Admin) ─── */}
      {activeForm && (
        <div className="admin-overlay">
          <div className="admin-panel glass admin-visual-modal">
            <div className="admin-header">
              <h2>
                {activeForm === 'event' && '📅 Gérer Événement'}
                {activeForm === 'gallery' && '📸 Gérer Galerie'}
                {activeForm === 'product' && '🛍️ Gérer Produit'}
                {activeForm === 'team' && '👥 Gérer Rider'}
                {activeForm === 'socials' && '🔗 Configurer Réseaux'}
                {activeForm === 'orders' && '📦 Gestion des Commandes'}
              </h2>
              <button className="admin-close" onClick={() => { setActiveForm(null); setEditingItem(null) }}>✕</button>
            </div>
            
            {activeForm === 'orders' ? (
              <div className="admin-orders-container">
                <h3>Liste des Commandes ({dbOrders.length})</h3>
                {dbOrders.length === 0 ? (
                  <p style={{color:'var(--text-muted)', textAlign:'center', padding:'30px'}}>Aucune commande enregistrée pour le moment.</p>
                ) : (
                  <div className="admin-orders-list">
                    {dbOrders.map(o => (
                      <div key={o.id} className="admin-order-card glass">
                        <div className="admin-order-header">
                          <div>
                            <strong>{o.customer_name}</strong> ({o.customer_email})
                            <span className="admin-order-date">{new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <span className={`status-badge ${o.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {o.status}
                          </span>
                        </div>
                        <div className="admin-order-details">
                          <p>🛍️ <strong>Objet :</strong> {o.product_name} {o.size && `(Taille: ${o.size})`} · <span className="text-accent">{o.price}</span></p>
                          <p>🎨 <strong>Pseudo à imprimer :</strong> <span className="checkout-graffiti-badge">{o.custom_text}</span></p>
                          <p>📍 <strong>Adresse :</strong> {o.shipping_address}, {o.shipping_zip} {o.shipping_city}, {o.shipping_country}</p>
                        </div>
                        <div className="admin-order-actions">
                          {o.status === 'En attente de paiement' && (
                            <button className="btn btn-sm btn-primary" onClick={() => handleUpdateOrderStatus(o.id, 'Paiement Validé')}>
                              ✅ Confirmer le Paiement
                            </button>
                          )}
                          {o.status === 'Paiement Validé' && (
                            <button className="btn btn-sm btn-outline" onClick={() => handleUpdateOrderStatus(o.id, 'En cours de fabrication')}>
                              🏭 Lancer Fabrication
                            </button>
                          )}
                          {o.status === 'En cours de fabrication' && (
                            <button className="btn btn-sm btn-success" onClick={() => handleUpdateOrderStatus(o.id, 'Expédiée')}>
                              📦 Marquer comme Expédiée
                            </button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteItem('orders', o.id)} style={{marginLeft:'auto'}}>
                            🗑️ Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="admin-form">
                {activeForm === 'event' && (
                  <>
                    <input type="text" placeholder="Titre de l'événement" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
                    <input type="text" placeholder="Lieu" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required />
                    <textarea placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={4} />
                  </>
                )}

                {activeForm === 'gallery' && (
                  <>
                    <input type="text" placeholder="Titre de l'image/vidéo" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
                    <div className="admin-row">
                      <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="photo">📸 Photo</option>
                        <option value="video">🎥 Vidéo</option>
                      </select>
                      <select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
                        <option value="upload">📁 Importer un fichier</option>
                        <option value="embed">🔗 Lien externe (YouTube, Insta...)</option>
                      </select>
                    </div>
                    {formData.source === 'upload' ? (
                      <input type="file" accept="image/*,video/*" onChange={e => setFormData({...formData, file: e.target.files[0]})} required />
                    ) : (
                      <input type="url" placeholder="https://youtube.com/... ou https://instagram.com/..." value={formData.embed_url} onChange={e => setFormData({...formData, embed_url: e.target.value})} required />
                    )}
                  </>
                )}

                {activeForm === 'product' && (
                  <>
                    <input type="text" placeholder="Nom du produit" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <textarea placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={2} />
                    <div className="admin-row">
                      <input type="text" placeholder="Prix (ex: 35€)" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
                      <input type="url" placeholder="Lien Paypal (Optionnel)" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} />
                    </div>
                    <input type="url" placeholder="URL photo produit (optionnel)" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
                    
                    {/* Stock Status Selector */}
                    <label className="admin-label">📦 Statut du Stock</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                      <option value="Coming soon">🔮 Coming soon (Bientôt)</option>
                      <option value="En stock">✅ En stock</option>
                      <option value="Sur commande">⚡ Sur commande</option>
                      <option value="Rupture de stock">❌ Rupture de stock</option>
                    </select>

                    {/* Visibility Toggle */}
                    <div className="admin-row-checkbox" style={{display:'flex', alignItems:'center', gap:'10px', marginTop:'8px'}}>
                      <input type="checkbox" id="is_visible" checked={formData.is_visible} onChange={e => setFormData({...formData, is_visible: e.target.checked})} style={{width:'auto', margin:0}} />
                      <label htmlFor="is_visible" style={{color:'#fff', fontSize:'0.9rem', cursor:'pointer'}}>Afficher le produit sur le site (Visible par le public)</label>
                    </div>
                  </>
                )}

                {activeForm === 'team' && (
                  <>
                    <input type="text" placeholder="Pseudo du Rider" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <input type="url" placeholder="URL Photo du Rider (optionnel)" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
                  </>
                )}

                {activeForm === 'socials' && (
                  <>
                    <label className="admin-label">Instagram</label>
                    <input type="url" placeholder="https://instagram.com/..." value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} />
                    <label className="admin-label">Facebook</label>
                    <input type="url" placeholder="https://facebook.com/..." value={formData.facebook} onChange={e => setFormData({...formData, facebook: e.target.value})} />
                    <label className="admin-label">TikTok</label>
                    <input type="url" placeholder="https://tiktok.com/@..." value={formData.tiktok} onChange={e => setFormData({...formData, tiktok: e.target.value})} />
                    <label className="admin-label">YouTube</label>
                    <input type="url" placeholder="https://youtube.com/..." value={formData.youtube} onChange={e => setFormData({...formData, youtube: e.target.value})} />
                    <label className="admin-label">Snapchat</label>
                    <input type="url" placeholder="https://snapchat.com/..." value={formData.snapchat} onChange={e => setFormData({...formData, snapchat: e.target.value})} />
                  </>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={uploading}>
                  {uploading ? 'Enregistrement en cours...' : 'Enregistrer'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default App
