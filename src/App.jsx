import { useState, useEffect } from 'react'
import './App.css'
import AdminPanel, { SITE_VERSION } from './AdminPanel'
import { supabase } from './supabaseClient'

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
  { title: 'Expo Éphémère', date: '12 Juin 2026', location: 'Lieu à définir', desc: 'Retrouvez nos dernières toiles et personnalisations en direct.' },
  { title: 'Ride & Graffiti', date: '20 Juillet 2026', location: 'Lieu à définir', desc: 'Session mob, peinture et bon son. Ouvert à tous.' },
]

const PRODUCTS = [
  { name: 'T-Shirt Custom', price: '35€', desc: 'Ton pseudo en style graffiti sur coton premium.', url: 'https://corentin-cartier.bigcartel.com/product/t-shirt-mob-y-dick-logo-officiel' },
  { name: 'Sweat à Capuche', price: '55€', desc: 'Hoodie noir avec le logo Mob Y Dick brodé.', url: 'https://corentin-cartier.bigcartel.com' },
  { name: 'Toile Originale', price: '120€', desc: 'Pièce unique peinte à la main par l\'équipe.', url: 'https://corentin-cartier.bigcartel.com' },
  { name: 'Stickers Pack', price: '8€', desc: 'Lot de 5 stickers vinyle haute qualité.', url: 'https://corentin-cartier.bigcartel.com' },
]

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [dbEvents, setDbEvents] = useState(null)
  const [dbGallery, setDbGallery] = useState(null)
  const [dbProducts, setDbProducts] = useState(null)
  const [dbTeam, setDbTeam] = useState(null)
  const [dbSettings, setDbSettings] = useState({})

  // Load dynamic data from Supabase (if configured)
  useEffect(() => {
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
    }
  }, [showAdmin]) // Refresh when admin closes

  const displayEvents = dbEvents || EVENTS.map((e, i) => ({ ...e, id: i }))
  const displayGallery = dbGallery
  const displayProducts = dbProducts || PRODUCTS
  const displayTeam = dbTeam || TEAM

  const navigate = (tab) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

      {/* ─── Navbar ─── */}
      <header className="navbar glass">
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

      <main>
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
                </div>
                <div className="team-grid">
                  {displayTeam.map((m, i) => (
                    <div key={m.name || m.id} className={`team-card fade-in fade-in-delay-${i % 4 + 1}`}>
                      <div className="team-img-wrap">
                        {m.image_url || m.img ? (
                          <img src={m.image_url || m.img} alt={m.name} className="team-img" />
                        ) : (
                          <div className="team-placeholder-icon">👤</div>
                        )}
                      </div>
                      <h3 className="team-name">{m.name}</h3>
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
              </div>
              <div className="gallery-grid">
                {displayGallery && displayGallery.length > 0 ? (
                  displayGallery.map((item, i) => (
                    <div key={item.id} className={`gallery-item glass fade-in fade-in-delay-${i % 4 + 1}`}>
                      {item.type === 'video' ? (
                        <video src={item.url} controls className="gallery-media" />
                      ) : (
                        <img src={item.url} alt={item.title} className="gallery-media" />
                      )}
                      <p>{item.title}</p>
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
              </div>
              <div className="events-list">
                {displayEvents.map((ev, i) => {
                  const dateStr = ev.date || ''
                  const dateObj = new Date(dateStr)
                  const isValidDate = !isNaN(dateObj.getTime()) && dateStr.includes('-')
                  const day = isValidDate ? dateObj.getDate() : dateStr.split(' ')[0]
                  const month = isValidDate ? dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : dateStr.split(' ').slice(1).join(' ')
                  return (
                    <div key={ev.id || i} className={`event-row glass fade-in fade-in-delay-${(i % 4) + 1}`}>
                      <div className="event-date-block">
                        <span className="event-day">{day}</span>
                        <span className="event-month">{month}</span>
                      </div>
                      <div className="event-info">
                        <h3>{ev.title}</h3>
                        <p className="event-location">📍 {ev.location}</p>
                        <p>{ev.description || ev.desc}</p>
                      </div>
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
                <p className="section-sub">Pièces uniques et objets personnalisables.</p>
              </div>
              <div className="shop-grid">
                {displayProducts.map((p, i) => (
                  <div key={p.id || i} className={`product-card glass fade-in fade-in-delay-${i % 4 + 1}`}>
                    <div className="product-img" style={p.image_url ? { backgroundImage: `url(${p.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                      {!p.image_url && <div className="product-badge">Nouveau</div>}
                    </div>
                    <div className="product-body">
                      <h3>{p.name}</h3>
                      <p className="product-desc">{p.description || p.desc}</p>
                      <div className="product-footer">
                        <span className="product-price">{p.price}</span>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Commander</a>
                      </div>
                    </div>
                  </div>
                ))}
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
          <button className="admin-trigger" onClick={() => setShowAdmin(true)}>⚙️ Admin</button>
        </div>
      </footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  )
}

export default App
