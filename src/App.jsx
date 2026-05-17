import { useState } from 'react'
import './App.css'

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
                  {TEAM.map((m, i) => (
                    <div key={m.name} className={`team-card fade-in fade-in-delay-${i % 4 + 1}`}>
                      <div className="team-img-wrap">
                        <img src={m.img} alt={m.name} className="team-img" />
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
                <div className="gallery-item glass fade-in fade-in-delay-1">
                  <div className="gallery-placeholder">📸</div>
                  <p>Session Ride - Mai 2026</p>
                </div>
                <div className="gallery-item glass fade-in fade-in-delay-2">
                  <div className="gallery-placeholder">🎥</div>
                  <p>Graff en live</p>
                </div>
                <div className="gallery-item glass fade-in fade-in-delay-3">
                  <div className="gallery-placeholder">📸</div>
                  <p>Le garage</p>
                </div>
                <div className="gallery-item glass fade-in fade-in-delay-4">
                  <div className="gallery-placeholder">🎥</div>
                  <p>Première sortie boue</p>
                </div>
                <div className="gallery-item glass fade-in fade-in-delay-1">
                  <div className="gallery-placeholder">📸</div>
                  <p>Expo éphémère #1</p>
                </div>
                <div className="gallery-item glass fade-in fade-in-delay-2">
                  <div className="gallery-placeholder">📸</div>
                  <p>Travail d'atelier</p>
                </div>
              </div>
              <p className="gallery-hint">📩 Tu fais partie de l'équipe ? Envoie tes photos et vidéos pour les voir ici !</p>
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
                {EVENTS.map((ev, i) => (
                  <div key={i} className={`event-row glass fade-in fade-in-delay-${i + 1}`}>
                    <div className="event-date-block">
                      <span className="event-day">{ev.date.split(' ')[0]}</span>
                      <span className="event-month">{ev.date.split(' ').slice(1).join(' ')}</span>
                    </div>
                    <div className="event-info">
                      <h3>{ev.title}</h3>
                      <p className="event-location">📍 {ev.location}</p>
                      <p>{ev.desc}</p>
                    </div>
                  </div>
                ))}
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
                {PRODUCTS.map((p, i) => (
                  <div key={i} className={`product-card glass fade-in fade-in-delay-${i % 4 + 1}`}>
                    <div className="product-img">
                      <div className="product-badge">Nouveau</div>
                    </div>
                    <div className="product-body">
                      <h3>{p.name}</h3>
                      <p className="product-desc">{p.desc}</p>
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
            <a href="#">Instagram</a>
            <a href="#">Facebook</a>
            <a href="#">TikTok</a>
          </div>
        </div>
        <div className="footer-bottom container">
          <p>&copy; 2026 Mob Y Dick. Tous droits réservés.</p>
        </div>
      </footer>
    </>
  )
}

export default App
