import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const SITE_VERSION = 'v1.8.0'

const TEAM = [
  { name: 'Alex', img: '/team/alex.png' },
  { name: 'Bob', img: '/team/bob.png' },
  { name: 'Fumax', img: '/team/fumax.png' },
  { name: 'Gauthier', img: '/team/gauthier.png' },
  { name: 'MadMat', img: '/team/madmat.png' },
  { name: 'StickMan', img: '/team/stickman.png' },
  { name: 'Flo', img: '/team/flo.png' },
  { name: 'JeanCulide', img: '/team/jeanculide.png' },
  { name: 'Leila', img: '/team/leila.png' },
]

const NICKNAMES = {
  alex: '/team/alex_nickname.png',
  bob: '/team/bob_nickname.png',
  fumax: '/team/fumax_nickname.png',
  gauthier: '/team/gauthier_nickname.png',
  madmat: '/team/madmat_nickname.png',
  stickman: '/team/stickman_nickname.png',
  flo: '/team/flo_nickname.png',
  jeanculide: '/team/jeanculide_nickname.png',
  leila: '/team/leila_nickname.png',
}


const EVENTS = [
  { title: 'Expo Éphémère', date: '2026-06-12', location: 'Lieu à définir', desc: 'Retrouvez nos dernières toiles et personnalisations en direct.' },
  { title: 'Ride & Graffiti', date: '2026-07-20', location: 'Lieu à définir', desc: 'Session mob, peinture et bon son. Ouvert à tous.' },
]

const PRODUCTS = [
  { name: 'T-Shirt Custom', price: '35€', desc: 'Ton pseudo en style graffiti sur coton premium.', status: 'En stock', is_visible: true },
  { name: 'Sweat à Capuche', price: '55€', desc: 'Hoodie noir avec le logo Mob Y Dick brodé.', status: 'Coming soon', is_visible: true },
  { name: 'Toile Originale', price: '120€', desc: 'Pièce unique peinte à la main par l\'équipe.', status: 'Sur commande', is_visible: true },
  { name: 'Stickers Pack', price: '8€', desc: 'Lot de 5 stickers vinyle haute qualité.', status: 'En stock', is_visible: true },
]

const BIKES_LIST = {
  rouge: {
    title: 'La Bête Rouge – Beast R-1',
    plate: 'N° 1',
    description: 'Conçue pour dompter la poussière et les terrains les plus extrêmes, la Bête Rouge est une véritable icône de puissance. Avec son cadre allégé rouge vermillon et son kit déco rétro-moderne personnalisé à la main par nos graphistes, elle combine agressivité visuelle et performances mécaniques pures. Son échappement racing libère un son rauque emblématique qui annonce la couleur sur chaque piste.',
    images: [
      '/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg',
      '/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg',
      '/motos/9ee5fac2-769a-461d-9f22-936c44a2b717.jpg',
      '/motos/f5def3ab-7a3e-4eb4-85fc-1bd659ef0ea9.jpg'
    ],
    specs: {
      'Cylindrée': '125 cc 2-Temps',
      'Suspensions': 'Fourche inversée réglable',
      'Échappement': 'Ligne FMF Gold Series',
      'Freinage': 'Disques hydrauliques ventilés',
      'Poids à vide': '88 kg',
      'Pneus': 'Michelin StarCross 5'
    }
  },
  orange: {
    title: 'L\'Étincelle Orange – Storm O-4',
    plate: 'N° 4',
    description: 'L\'Étincelle Orange ne passe jamais inaperçue. Conçue spécialement pour le stunt et le motocross freestyle, elle arbore un kit déco orange fluo éclatant qui rappelle les flammes légendaires de notre logo. Sa maniabilité hors du commun et sa reprise ultra-nerveuse à bas régime en font la machine favorite pour envoyer des figures de l\'espace et survoler les bosses.',
    images: [
      '/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg',
      '/motos/5bebfecf-6fbf-4327-a6ec-59df4de8dffd.jpg',
      '/motos/c2b259ef-7132-42f1-bbe6-225949254c2a.jpg',
      '/motos/e551714e-aa71-4599-9f6c-bcdea4e944b1.jpg'
    ],
    specs: {
      'Cylindrée': '150 cc Haute-Compression',
      'Suspensions': 'Monoamortisseur WP Pro',
      'Échappement': 'Silencieux Akrapovič Custom',
      'Guidon': 'Guidon Renthal Fatbar',
      'Poids à vide': '91 kg',
      'Pneus': 'Pirelli Scorpion MX'
    }
  },
  noir: {
    title: 'L\'Ombre Noire – Stealth N-67',
    plate: 'N° 67',
    description: 'Sombre, furtive et d\'une élégance redoutable, l\'Ombre Noire est bâtie pour la performance en toute discrétion. Son kit déco noir mat anthracite texturé en fibre de carbone lui confère un look agressif intemporel. Sous son carénage se cache une bête de course optimisée pour les départs rapides et les accélérations brutales, plébiscitée par les riders les plus techniques de la meute.',
    images: [
      '/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg',
      '/motos/6fae5df4-0ec9-4e66-ba64-885a453960df.jpg',
      '/motos/a5956043-1e5b-454c-82e1-db0afdad9d99.jpg',
      '/motos/cfc2f2d9-647f-40f1-97bf-bc5e90eb423f.jpg'
    ],
    specs: {
      'Cylindrée': '250 cc 4-Temps Injection',
      'Suspensions': 'Showa SFF-Air TAC',
      'Échappement': 'Double sortie Yoshimura Carbon',
      'Jantes': 'Excel A60 noires renforcées',
      'Poids à vide': '98 kg',
      'Pneus': 'Dunlop Geomax MX33'
    }
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showLegalModal, setShowLegalModal] = useState(false)
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
  const [dbBikes, setDbBikes] = useState(null)

  // Form Modal States (Admin)
  const [activeForm, setActiveForm] = useState(null) // 'event' | 'gallery' | 'product' | 'team' | 'socials' | 'orders'
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({})
  const [uploading, setUploading] = useState(false)

  // Checkout Modal States (Client)
  const [checkoutProduct, setCheckoutProduct] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [checkoutStep, setCheckoutStep] = useState(1) // 1: Personalization, 2: Shipping, 3: Validation, 4: Redirection
  const [lightboxImage, setLightboxImage] = useState(null)
  const [selectedBike, setSelectedBike] = useState('rouge')
  const [selectedBikeImgIndex, setSelectedBikeImgIndex] = useState(0)
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
      supabase.from('bikes').select('*').order('sort_order', { ascending: true })
        .then(({ data }) => { if (data) setDbBikes(data) })
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

  // Automatically sync Leila to Supabase database if missing and admin is logged in
  useEffect(() => {
    if (isAdmin && dbTeam && dbTeam.length > 0 && supabase) {
      const hasLeila = dbTeam.some(member => member.name.toLowerCase() === 'leila')
      if (!hasLeila) {
        supabase.from('team').insert([{
          name: 'Leila',
          image_url: '/team/leila.png',
          sort_order: dbTeam.length
        }]).then(({ error }) => {
          if (!error) refreshData()
        })
      }
    }
  }, [isAdmin, dbTeam])


  // Fix Javascript empty array traps for default fallback render cards
  const displayEvents = (dbEvents && dbEvents.length > 0) ? dbEvents : EVENTS.map((e, i) => ({ ...e, id: i }))
  const displayGallery = dbGallery
  const displayProducts = (dbProducts && dbProducts.length > 0) ? dbProducts : PRODUCTS
  const displayTeam = (() => {
    const list = (dbTeam && dbTeam.length > 0) ? [...dbTeam] : [...TEAM]
    const hasLeila = list.some(m => m.name.toLowerCase() === 'leila')
    if (!hasLeila) {
      list.push({ name: 'Leila', image_url: '/team/leila.png', img: '/team/leila.png' })
    }
    return list
  })()

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

  const handleInitializeDatabase = async () => {
    if (!supabase) {
      alert("Supabase n'est pas configuré.")
      return
    }
    setUploading(true)
    try {
      // 1. Initialize products if empty
      if (!dbProducts || dbProducts.length === 0) {
        const productsToInsert = PRODUCTS.map((p, i) => ({
          name: p.name,
          description: p.desc,
          price: p.price,
          status: p.status,
          is_visible: p.is_visible,
          sort_order: i,
          image_url: ''
        }))
        const { error } = await supabase.from('products').insert(productsToInsert)
        if (error) throw error
      }
      
      // 2. Initialize team if empty
      if (!dbTeam || dbTeam.length === 0) {
        const teamToInsert = TEAM.map((t, i) => ({
          name: t.name,
          image_url: t.img,
          sort_order: i
        }))
        const { error } = await supabase.from('team').insert(teamToInsert)
        if (error) throw error
      }

      // 3. Initialize events if empty
      if (!dbEvents || dbEvents.length === 0) {
        const eventsToInsert = EVENTS.map(e => ({
          title: e.title,
          date: e.date,
          location: e.location,
          description: e.desc
        }))
        const { error } = await supabase.from('events').insert(eventsToInsert)
        if (error) throw error
      }

      alert('Base de données initialisée avec succès ! Les produits, riders et événements par défaut sont maintenant modifiables.')
      refreshData()
    } catch (err) {
      alert("Erreur lors de l'initialisation : " + err.message)
    } finally {
      setUploading(false)
    }
  }

  // ─── Inline CRUD Handlers ───
  const handleDeleteItem = async (table, id, item = null) => {
    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return
    try {
      if (table === 'gallery' && item && item.source === 'upload' && item.file_name) {
        await supabase.storage.from('Gallery').remove([item.file_name])
      }
      if (table === 'products' && item && item.image_url && (item.image_url.includes('/gallery/') || item.image_url.includes('/Gallery/'))) {
        // Extract fileName from public URL if uploaded locally
        const fileName = item.image_url.split(/\/gallery\/|\/Gallery\//i).pop()
        if (fileName) await supabase.storage.from('Gallery').remove([fileName])
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
        image_urls: item.image_url ? item.image_url.split(',').filter(Boolean) : [],
        status: item.status || 'Coming soon',
        is_visible: item.is_visible !== undefined ? item.is_visible : true,
        is_customizable: item.is_customizable !== undefined ? item.is_customizable : true,
        has_sizes: item.has_sizes !== undefined ? item.has_sizes : false,
        files: []
      } : { 
        name: '', 
        description: '', 
        price: '', 
        image_urls: [],
        status: 'Coming soon',
        is_visible: true,
        is_customizable: true,
        has_sizes: false,
        files: []
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
    } else if (type === 'bike_edit') {
      const currentBikes = getBikesList()
      const b = currentBikes[item]
      setFormData({
        id: item,
        title: b.title,
        plate: b.plate,
        description: b.description,
        image_urls: [...(b.images || [])],
        specs: { ...(b.specs || {}) },
        sort_order: item === 'rouge' ? 0 : item === 'orange' ? 1 : 2,
        files: []
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
          const { error } = await supabase.storage.from('Gallery').upload(fileName, file)
          if (error) throw error
          const { data: { publicUrl } } = supabase.storage.from('Gallery').getPublicUrl(fileName)
          await supabase.from('gallery').insert([{
            title: formData.title, type: formData.type,
            url: publicUrl, file_name: fileName, source: 'upload'
          }])
        }
      } else if (activeForm === 'product') {
        const uploadedUrls = []

        // Upload any new files selected to Supabase Storage
        if (formData.files && formData.files.length > 0) {
          for (const file of formData.files) {
            const fileName = `products/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${file.name.split('.').pop()}`
            const { error } = await supabase.storage.from('Gallery').upload(fileName, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('Gallery').getPublicUrl(fileName)
            uploadedUrls.push(publicUrl)
          }
        }

        // Combine existing (non-deleted) URLs with the newly uploaded URLs
        const allUrls = [...(formData.image_urls || []), ...uploadedUrls]
        const finalImageUrl = allUrls.join(',')

        const productPayload = {
          name: formData.name,
          description: formData.description,
          price: formData.price,
          image_url: finalImageUrl,
          status: formData.status,
          is_visible: formData.is_visible,
          is_customizable: formData.is_customizable !== undefined ? formData.is_customizable : true,
          has_sizes: formData.has_sizes !== undefined ? formData.has_sizes : false,
          url: null, // Clear PayPal link column so it relies 100% on dynamic automated PayPal routing
          sort_order: editingItem ? editingItem.sort_order : (dbProducts?.length || 0)
        }

        if (editingItem && editingItem.id) {
          await supabase.from('products').update(productPayload).eq('id', editingItem.id)
        } else {
          await supabase.from('products').insert([productPayload])
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
      } else if (activeForm === 'bike_edit') {
        const uploadedUrls = []
        if (formData.files && formData.files.length > 0) {
          for (const file of formData.files) {
            const fileName = `motos/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${file.name.split('.').pop()}`
            const { error } = await supabase.storage.from('Gallery').upload(fileName, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('Gallery').getPublicUrl(fileName)
            uploadedUrls.push(publicUrl)
          }
        }
        const allUrls = [...(formData.image_urls || []), ...uploadedUrls]
        const finalImageUrl = allUrls.join(',')
        
        const bikePayload = {
          title: formData.title,
          plate: formData.plate,
          description: formData.description,
          images: finalImageUrl,
          specs: formData.specs,
          sort_order: formData.sort_order
        }
        
        const { error } = await supabase.from('bikes').update(bikePayload).eq('id', formData.id)
        if (error) throw error
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
    setCurrentImageIndex(0)
    setCheckoutStep(1)
    setCheckoutData({
      customText: '',
      size: product.has_sizes ? 'M' : '',
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

  const getBikesList = () => {
    if (dbBikes && dbBikes.length > 0) {
      const list = {}
      dbBikes.forEach(b => {
        list[b.id] = {
          title: b.title,
          plate: b.plate,
          description: b.description,
          images: b.images ? b.images.split(',').filter(Boolean) : [],
          specs: typeof b.specs === 'string' ? JSON.parse(b.specs) : b.specs
        }
      })
      return list
    }
    return BIKES_LIST
  }

  const getPayPalLink = (product) => {
    const numericPrice = product.price.replace(/[^0-9]/g, '')
    return `https://paypal.me/CorentinCARTIER/${numericPrice}`
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
              {(!dbProducts || dbProducts.length === 0) && (
                <button className="btn btn-primary btn-sm" onClick={handleInitializeDatabase} style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', fontWeight: 'bold' }}>
                  🚀 Remplir la base
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => handleOpenForm('orders')}>
                📦 Commandes {dbOrders.filter(o => o.status === 'En attente de paiement').length > 0 && (
                  <span className="admin-banner-badge">{dbOrders.filter(o => o.status === 'En attente de paiement').length}</span>
                )}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleOpenForm('socials')}>🔗 Configurer Réseaux</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleOpenForm('bikes_admin')}>🏍️ Gérer les Motos</button>
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
            {['home', 'gallery', 'team', 'bikes', 'shop', 'events'].map((tab) => (
              <button
                key={tab}
                className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                onClick={() => navigate(tab)}
              >
                {tab === 'home' ? '🏠 Accueil' : 
                 tab === 'gallery' ? '📸 Galerie' : 
                 tab === 'team' ? '🏍️ Les Riders' : 
                 tab === 'bikes' ? '🔥 Les Motos' : 
                 tab === 'shop' ? '🛒 Boutique' : '📅 Événements'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={isAdmin ? 'with-admin-banner' : ''}>
        {/* ─── HOME ─── */}
        {activeTab === 'home' && (
          <section className="hero">
            <div className="container hero-inner">
              <img src="/logo.png" alt="Mob Y Dick" className="hero-logo fade-in" />
              <h1 className="hero-title fade-in fade-in-delay-1">
                MOBCROSS <span className="text-accent">TEAM</span>
              </h1>
              <p className="hero-sub fade-in fade-in-delay-2">
                Vêtements & Objets Personnalisés
              </p>
              <div className="hero-btns fade-in fade-in-delay-3">
                <button className="btn btn-primary" onClick={() => navigate('shop')}>Voir la Boutique</button>
                <button className="btn btn-outline" onClick={() => navigate('team')}>Les Riders</button>
              </div>
            </div>
            <div className="hero-scroll-hint">
              <span>↓</span>
            </div>
          </section>
        )}

        {/* ─── RIDERS (DEDICATED PAGE) ─── */}
        {activeTab === 'team' && (
          <section className="section page-top">
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
                    {NICKNAMES[m.name.toLowerCase()] && m.name.toLowerCase() !== 'bob' && m.name.toLowerCase() !== 'fumax' && m.name.toLowerCase() !== 'gauthier' ? (
                      <div className="team-nickname-wrap">
                        <img 
                          src={NICKNAMES[m.name.toLowerCase()]} 
                          alt={m.name} 
                          className="team-nickname-img" 
                          style={m.name.toLowerCase() === 'jeanculide' ? { height: '54px', transform: 'scale(1.35)' } : {}}
                        />
                      </div>
                    ) : (
                      <h3 className="team-name">{m.name}</h3>
                    )}

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
        )}

        {/* ─── BIKES ─── */}
        {activeTab === 'bikes' && (
          <section className="section page-top">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Nos Machines</span>
                <h2>Les Motos Mobcross</h2>
                <p className="section-sub">Découvre les 3 monstres de la team Mob Y Dick, personnalisés à la main.</p>
              </div>

              <div className="bikes-container" style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '40px' }}>
                {/* Bike Selector Buttons */}
                <div className="bikes-tabs" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {[
                    { id: 'rouge', name: '🔴 Moto Rouge', color: '#ff3333' },
                    { id: 'orange', name: '🟠 Moto Orange', color: '#ff5500' },
                    { id: 'noir', name: '⚫ Moto Noir', color: '#888888' }
                  ].map(bike => (
                    <button
                      key={bike.id}
                      className={`btn ${selectedBike === bike.id ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => {
                        setSelectedBike(bike.id);
                        setSelectedBikeImgIndex(0);
                      }}
                      style={{ 
                        border: selectedBike === bike.id ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        boxShadow: selectedBike === bike.id ? `0 4px 20px ${bike.id === 'rouge' ? 'rgba(255,51,51,0.3)' : bike.id === 'orange' ? 'var(--accent-glow)' : 'rgba(255,255,255,0.1)'}` : 'none',
                        background: selectedBike === bike.id ? (bike.id === 'rouge' ? 'linear-gradient(135deg, #ff3333 0%, #aa0000 100%)' : bike.id === 'orange' ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' : 'linear-gradient(135deg, #333 0%, #111 100%)') : ''
                      }}
                    >
                      {bike.name}
                    </button>
                  ))}
                </div>

                {/* Bike Showcase details */}
                {(() => {
                  const bikeData = getBikesList()[selectedBike];
                  const activeImg = bikeData.images[selectedBikeImgIndex] || bikeData.images[0];
                  return (
                    <div className="bike-showcase glass fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px', padding: '40px', borderRadius: '20px', border: '1px solid var(--border-subtle)', background: 'var(--bg-glass)' }}>
                      {/* Left Side: Photo Carousel */}
                      <div className="bike-gallery-side" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div 
                          className="bike-main-img-wrap" 
                          style={{ position: 'relative', width: '100%', height: '350px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#000', cursor: 'zoom-in' }} 
                          onClick={() => setLightboxImage(activeImg)}
                          title="Cliquez pour agrandir en plein écran"
                        >
                          <img src={activeImg} alt={bikeData.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          <div style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(0,0,0,0.7)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🔍 Plein Écran
                          </div>
                        </div>
                        
                        <div className="bike-thumbnails" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
                          {bikeData.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`Aperçu ${idx + 1}`}
                              style={{ 
                                width: '70px', 
                                height: '70px', 
                                objectFit: 'cover', 
                                borderRadius: '8px', 
                                border: selectedBikeImgIndex === idx ? `2px solid ${selectedBike === 'rouge' ? '#ff3333' : selectedBike === 'orange' ? 'var(--accent)' : '#fff'}` : '1px solid rgba(255,255,255,0.1)', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s ease',
                                opacity: selectedBikeImgIndex === idx ? 1 : 0.6
                              }}
                              onClick={() => setSelectedBikeImgIndex(idx)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Right Side: Description and Specifications */}
                      <div className="bike-details-side" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ 
                            padding: '6px 14px', 
                            borderRadius: '20px', 
                            fontSize: '0.85rem', 
                            fontWeight: 'bold', 
                            fontFamily: 'var(--font-heading)',
                            background: selectedBike === 'rouge' ? '#ff3333' : selectedBike === 'orange' ? 'var(--accent)' : '#333', 
                            color: '#fff' 
                          }}>
                            {bikeData.plate}
                          </span>
                          <h3 style={{ margin: 0, fontSize: '1.8rem' }}>{bikeData.title}</h3>
                        </div>

                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', margin: 0 }}>
                          {bikeData.description}
                        </p>

                        <div className="bike-specs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '10px' }}>
                          {Object.entries(bikeData.specs).map(([key, val]) => (
                            <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{key}</span>
                              <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600', marginTop: '2px' }}>{val}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigate('team')}>
                            🏍️ Les Riders
                          </button>
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('shop')}>
                            🛒 La Boutique
                          </button>
                          {isAdmin && (
                            <button 
                              className="btn btn-outline" 
                              style={{ width: '100%', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 'bold', marginTop: '10px' }} 
                              onClick={() => handleOpenForm('bike_edit', selectedBike)}
                            >
                              ✏️ Modifier cette Moto
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>
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

                      {(() => {
                        const imageUrls = p.image_url ? p.image_url.split(',').filter(Boolean) : []
                        const firstImage = imageUrls[0] || ''
                        return (
                          <div 
                            className="product-img" 
                            style={firstImage ? { backgroundImage: `url(${firstImage})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in' } : { cursor: 'zoom-in' }}
                            onClick={() => { if (firstImage) setLightboxImage(firstImage); }}
                            title="Cliquez pour agrandir"
                          >
                            {!firstImage && <div className="product-badge">Graffiti</div>}
                          </div>
                        )
                      })()}
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
                          <button onClick={() => handleDeleteItem('products', p.id, p)}>🗑️</button>
                        </div>
                      )}
                    </div>
                  )
                })}
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
            <p>Mobcross Team</p>
          </div>
          <div className="footer-links">
            <h4>Navigation</h4>
            <button onClick={() => navigate('home')}>Accueil</button>
            <button onClick={() => navigate('gallery')}>Galerie</button>
            <button onClick={() => navigate('team')}>Les Riders</button>
            <button onClick={() => navigate('bikes')}>Les Motos</button>
            <button onClick={() => navigate('shop')}>Boutique</button>
            <button onClick={() => navigate('events')}>Événements</button>
          </div>
          <div className="footer-links">
            <h4>Réseaux</h4>
            <a href={dbSettings.instagram || "https://instagram.com"} target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href={dbSettings.facebook || "https://facebook.com"} target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href={dbSettings.tiktok || "https://tiktok.com"} target="_blank" rel="noopener noreferrer">TikTok</a>
            {dbSettings.youtube && <a href={dbSettings.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
            {dbSettings.snapchat && <a href={dbSettings.snapchat} target="_blank" rel="noopener noreferrer">Snapchat</a>}
          </div>
          <div className="footer-qr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', textAlign: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '1.5px', color: 'var(--text-primary)' }}>📱 Scanner</h4>
            <div style={{ position: 'relative', padding: '6px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-accent)', borderRadius: '12px', boxShadow: '0 4px 20px rgba(255, 85, 0, 0.1)', cursor: 'zoom-in', transition: 'all 0.3s ease' }} onClick={() => setLightboxImage('/QRCODEMYD.png')} title="Cliquez pour agrandir">
              <img src="/QRCODEMYD.png" alt="QR Code Mob Y Dick" style={{ width: '80px', height: '80px', borderRadius: '6px', objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Version Mobile</span>
          </div>
        </div>
        <div className="footer-bottom container">
          <p>&copy; 2026 Mob Y Dick. Tous droits réservés. <span className="site-version">{SITE_VERSION}</span></p>
          <div className="footer-bottom-actions">
            <button className="footer-legal-btn" onClick={() => setShowLegalModal(true)}>⚖️ Mentions Légales & CGV</button>
            <button className="admin-trigger" onClick={() => {
              if (isAdmin) {
                handleOpenForm('orders')
              } else {
                setShowLoginModal(true)
              }
            }}>{isAdmin ? '📦 Gérer Commandes' : '⚙️ Admin'}</button>
          </div>
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

      {/* ─── Legal & CGV Compliance Modal ─── */}
      {showLegalModal && (
        <div className="admin-overlay">
          <div className="admin-panel glass admin-visual-modal legal-modal-scrollbar" style={{maxWidth:'650px', maxHeight:'80vh', overflowY:'auto'}}>
            <div className="admin-header">
              <h2>⚖️ Mentions Légales & CGV</h2>
              <button className="admin-close" onClick={() => setShowLegalModal(false)}>✕</button>
            </div>
            <div className="legal-content-container" style={{fontSize:'0.85rem', lineHeight:'1.5', color:'var(--text-secondary)'}}>
              
              <h3 className="text-accent" style={{fontSize:'1rem', marginTop:0}}>1. Mentions Légales</h3>
              <p>
                <strong>Éditeur du site :</strong> Mob Y Dick Brand, représenté par Corentin Cartier.<br />
                <strong>Contact :</strong> via nos liens de réseaux sociaux officiels ou par e-mail.<br />
                <strong>Hébergeur :</strong> Vercel Inc., 650 2nd St, San Francisco, CA 94107, USA (https://vercel.com).<br />
                <strong>Propriété intellectuelle :</strong> L'intégralité des visuels, logos, marques et designs de lettrages graffiti présentés sur ce site sont la propriété exclusive de l'équipe Mob Y Dick. Toute reproduction est interdite sans accord écrit.
              </p>

              <h3 className="text-accent" style={{fontSize:'1rem', marginTop:'20px'}}>2. Politique de Confidentialité (RGPD)</h3>
              <p>
                Nous prenons la protection de vos données personnelles très au sérieux. Les informations que vous saisissez lors d'une commande (nom, adresse de livraison, adresse e-mail) sont **uniquement** collectées et transmises à notre prestataire de fabrication à la demande (Printful) dans le but exclusif de fabriquer et d'expédier vos articles. <br />
                * Aucune donnée n'est revendue à des tiers ou utilisée à des fins de ciblage publicitaire.<br />
                * Vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles sur simple demande par mail.
              </p>

              <h3 className="text-accent" style={{fontSize:'1rem', marginTop:'20px'}}>3. CGV : Commande de Produits Personnalisés</h3>
              <p>
                <strong>Nature des Produits :</strong> Nos produits (T-shirts, hoodies, mugs, etc.) sont entièrement personnalisés et fabriqués à l'unité selon le pseudo graffiti fourni par le client. <br />
                <strong>Droit de Rétractation Spécifique :</strong> Conformément à l'article **L221-28 du Code de la Consommation français**, le droit de rétractation de 14 jours **ne s'applique pas** aux biens confectionnés nettement personnalisés selon les spécifications du consommateur. Ainsi, une fois la commande validée et payée, aucun retour, remboursement ou échange n'est possible (sauf en cas d'erreur avérée de fabrication ou produit défectueux).<br />
                <strong>Livraison & Délais :</strong> Nos produits étant fabriqués à la demande par Printful, les délais de livraison varient généralement entre 5 et 10 jours ouvrés selon le pays de destination.
              </p>

              <h3 className="text-accent" style={{fontSize:'1rem', marginTop:'20px'}}>4. Règlement des Litiges & Paiements</h3>
              <p>
                Les transactions financières s'effectuent de manière externe et sécurisée via la plateforme PayPal ou Stripe. Mob Y Dick n'enregistre aucune information bancaire sur ses propres serveurs. En cas de litige, nous vous invitons à contacter notre équipe via nos réseaux sociaux afin de trouver une solution amiable.
              </p>

              <button className="btn btn-primary" style={{width:'100%', marginTop:'24px'}} onClick={() => setShowLegalModal(false)}>J'ai compris et j'accepte</button>
            </div>
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
                  
                  {/* Image Carousel */}
                  {checkoutProduct.image_url && (
                    <div className="checkout-media-carousel" style={{ marginBottom: '20px', position: 'relative', textAlign: 'center' }}>
                      {(() => {
                        const urls = checkoutProduct.image_url.split(',').filter(Boolean)
                        if (urls.length === 0) return null
                        const activeUrl = urls[currentImageIndex] || urls[0]
                        return (
                          <>
                            <div className="carousel-main-wrap" style={{ position: 'relative', display: 'inline-block', width: '100%', height: '240px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
                              <img 
                                src={activeUrl} 
                                alt={checkoutProduct.name} 
                                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
                                onClick={() => setLightboxImage(activeUrl)}
                                title="Cliquez pour voir en plein écran"
                              />
                              
                              {urls.length > 1 && (
                                <>
                                  <button 
                                    type="button"
                                    className="carousel-arrow left"
                                    onClick={() => setCurrentImageIndex((currentImageIndex - 1 + urls.length) % urls.length)}
                                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,85,0,0.5)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    ◀
                                  </button>
                                  <button 
                                    type="button"
                                    className="carousel-arrow right"
                                    onClick={() => setCurrentImageIndex((currentImageIndex + 1) % urls.length)}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,85,0,0.5)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    ▶
                                  </button>
                                  <div className="carousel-counter" style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--accent)' }}>
                                    {currentImageIndex + 1} / {urls.length}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {urls.length > 1 && (
                              <div className="carousel-thumbnails" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px', overflowX: 'auto', padding: '4px 0' }}>
                                {urls.map((url, idx) => (
                                  <img 
                                    key={idx}
                                    src={url} 
                                    alt="Thumbnail" 
                                    onClick={() => setCurrentImageIndex(idx)}
                                    style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '6px', border: currentImageIndex === idx ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.2s ease', opacity: currentImageIndex === idx ? 1 : 0.6 }} 
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                  
                  {checkoutProduct.is_customizable !== false && (
                    <>
                      <label className="admin-label">✏️ Écris ton Pseudo Graffiti à imprimer :</label>
                      <input type="text" placeholder="Ex: FLO, FUMAX, ALEX..." value={checkoutData.customText} onChange={e => setCheckoutData({...checkoutData, customText: e.target.value})} required maxLength={20} className="checkout-large-input" />
                    </>
                  )}
                  
                  {checkoutProduct.has_sizes === true && (
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
                    {checkoutProduct.is_customizable !== false ? (
                      <p><strong>Pseudo Graffiti :</strong> <span className="checkout-graffiti-badge">{checkoutData.customText}</span></p>
                    ) : (
                      <p><strong>Personnalisation :</strong> <span style={{color:'var(--text-muted)'}}>Aucune (Produit Standard)</span></p>
                    )}
                    {checkoutProduct.has_sizes === true && checkoutData.size && <p><strong>Taille :</strong> {checkoutData.size}</p>}
                    <hr style={{borderColor:'rgba(255,85,0,0.2)', margin:'10px 0'}} />
                    <p><strong>Destinataire :</strong> {checkoutData.customerName}</p>
                    <p><strong>Contact :</strong> {checkoutData.customerEmail}</p>
                    <p><strong>Adresse :</strong> {checkoutData.shippingAddress}, {checkoutData.shippingZip} {checkoutData.shippingCity}, {checkoutData.shippingCountry}</p>
                  </div>
                  
                  <p className="checkout-warning-text">⚠️ En cliquant sur valider, ton achat sera enregistré. Tu procéderas ensuite au règlement sécurisé sur PayPal.</p>

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
                  
                  <a href={getPayPalLink(checkoutProduct)} target="_blank" rel="noopener noreferrer" className="btn btn-primary checkout-paypal-btn" onClick={() => setCheckoutProduct(null)}>
                    💰 Payer {checkoutProduct.price} via PayPal
                  </a>
                  
                  <p className="checkout-hint" style={{marginTop:'16px', fontSize:'0.8rem', color:'var(--text-muted)'}}>
                    Dès confirmation de ton paiement par notre équipe, ta commande passera en fabrication ! Merci du soutien !
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
                {activeForm === 'bikes_admin' && '🏍️ Gérer les Motos'}
                {activeForm === 'bike_edit' && '✏️ Modifier la Moto'}
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
            ) : activeForm === 'bikes_admin' ? (
              <div className="admin-orders-container" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                {(!dbBikes || dbBikes.length === 0) && (
                  <div style={{ background: 'rgba(255, 85, 0, 0.08)', border: '1px dashed var(--accent)', padding: '20px', borderRadius: '12px', marginBottom: '20px', textAlign: 'left' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#fff', lineHeight: '1.5' }}>
                      ⚠️ <strong>Base de données :</strong> La table <code>bikes</code> n'existe pas encore dans votre base de données Supabase.
                    </p>
                    <p style={{ margin: '0 0 15px 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      Pour pouvoir modifier les motos et charger vos propres photos en ligne, copiez la requête SQL ci-dessous, allez dans votre <strong>Dashboard Supabase</strong> → <strong>SQL Editor</strong> → cliquez sur <strong>New Query</strong>, collez et cliquez sur <strong>Run</strong>.
                    </p>
                    <textarea 
                      readOnly 
                      value={`-- Requete de creation de la table bikes\nCREATE TABLE IF NOT EXISTS public.bikes (\n    id text PRIMARY KEY,\n    title text NOT NULL,\n    plate text NOT NULL,\n    description text NOT NULL,\n    images text NOT NULL,\n    specs jsonb NOT NULL,\n    sort_order integer DEFAULT 0,\n    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL\n);\n\nALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Allow public read access for bikes" ON public.bikes FOR SELECT USING (true);\nCREATE POLICY "Allow admin full access for bikes" ON public.bikes USING (auth.role() = 'authenticated');\n\nINSERT INTO public.bikes (id, title, plate, description, images, specs, sort_order)\nVALUES \n(\n  'rouge',\n  'La Bête Rouge – Beast R-1',\n  'N° 1',\n  'Conçue pour dompter la poussière et les terrains les plus extrêmes, la Bête Rouge est une véritable icône de puissance. Avec son cadre allégé rouge vermillon et son kit déco rétro-moderne personnalisé à la main par nos graphistes, elle combine agressivité visuelle et performances mécaniques pures. Son échappement racing libère un son rauque emblématique qui annonce la couleur sur chaque piste.',\n  '/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg,/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg,/motos/9ee5fac2-769a-461d-9f22-936c44a2b717.jpg,/motos/f5def3ab-7a3e-4eb4-85fc-1bd659ef0ea9.jpg',\n  '{"Cylindrée": "125 cc 2-Temps", "Suspensions": "Fourche inversée réglable", "Échappement": "Ligne FMF Gold Series", "Freinage": "Disques hydrauliques ventilés", "Poids à vide": "88 kg", "Pneus": "Michelin StarCross 5"}'::jsonb,\n  0\n),\n(\n  'orange',\n  'L''Étincelle Orange – Storm O-4',\n  'N° 4',\n  'L''Étincelle Orange ne passe jamais inaperçue. Conçue spécialement pour le stunt et le motocross freestyle, elle arbore un kit déco orange fluo éclatant qui rappelle les flammes légendaires de notre logo. Sa maniabilité hors du commun et sa reprise ultra-nerveuse à bas régime en font la machine favorite pour envoyer des figures de l''espace et survoler les bosses.',\n  '/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg,/motos/5bebfecf-6fbf-4327-a6ec-59df4de8dffd.jpg,/motos/c2b259ef-7132-42f1-bbe6-225949254c2a.jpg,/motos/e551714e-aa71-4599-9f6c-bcdea4e944b1.jpg',\n  '{"Cylindrée": "150 cc Haute-Compression", "Suspensions": "Monoamortisseur WP Pro", "Échappement": "Silencieux Akrapovič Custom", "Guidon": "Guidon Renthal Fatbar", "Poids à vide": "91 kg", "Pneus": "Pirelli Scorpion MX"}'::jsonb,\n  1\n),\n(\n  'noir',\n  'L''Ombre Noire – Stealth N-67',\n  'N° 67',\n  'Sombre, furtive et d''une élégance redoutable, l''Ombre Noire est bâtie pour la performance en toute discrétion. Son kit déco noir mat anthracite texturé en fibre de carbone lui confère un look agressif intemporel. Sous son carénage se cache une bête de course optimisée pour les départs rapides et les accélérations brutales, plébiscitée par les riders les plus techniques de la meute.',\n  '/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg,/motos/6fae5df4-0ec9-4e66-ba64-885a453960df.jpg,/motos/a5956043-1e5b-454c-82e1-db0afdad9d99.jpg,/motos/cfc2f2d9-647f-40f1-97bf-bc5e90eb423f.jpg',\n  '{"Cylindrée": "250 cc 4-Temps Injection", "Suspensions": "Showa SFF-Air TAC", "Échappement": "Double sortie Yoshimura Carbon", "Jantes": "Excel A60 noires renforcées", "Poids à vide": "98 kg", "Pneus": "Dunlop Geomax MX33"}'::jsonb,\n  2\n)\nON CONFLICT (id) DO NOTHING;`} 
                      style={{ width: '100%', height: '120px', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', resize: 'none', outline: 'none' }} 
                    />
                    <button 
                      type="button" 
                      className="btn btn-sm btn-outline" 
                      style={{ marginTop: '10px' }} 
                      onClick={(e) => { 
                        const txt = e.target.previousSibling;
                        txt.select();
                        document.execCommand('copy');
                        alert('Script SQL copié dans le presse-papiers !');
                      }}
                    >
                      📋 Copier le Script SQL
                    </button>
                  </div>
                )}
                
                <h3>Liste des Motos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {['rouge', 'orange', 'noir'].map(id => {
                    const b = getBikesList()[id];
                    return (
                      <div key={id} className="admin-order-card glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ width: '50px', height: '50px', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
                            <img src={b.images[0] || '/logo.png'} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <strong style={{ fontSize: '1.05rem', color: '#fff' }}>{b.title}</strong>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Numéro : {b.plate}</div>
                          </div>
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={() => handleOpenForm('bike_edit', id)}>
                          ✏️ Modifier
                        </button>
                      </div>
                    );
                  })}
                </div>
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
                    
                    <input type="text" placeholder="Prix (ex: 35€)" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />

                    {/* Local File Photo Upload */}
                    <label className="admin-label">🖼️ Photos du Produit (Plusieurs possibles)</label>
                    
                    {/* Render current images with delete buttons */}
                    {formData.image_urls && formData.image_urls.length > 0 && (
                      <div style={{display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'12px'}}>
                        {formData.image_urls.map((url, idx) => (
                          <div key={idx} style={{position:'relative', width:'60px', height:'60px', borderRadius:'6px', overflow:'hidden', border:'1px solid rgba(255,255,255,0.2)'}}>
                            <img src={url} alt="Aperçu" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                            <button 
                              type="button" 
                              onClick={() => {
                                const updated = formData.image_urls.filter((_, i) => i !== idx)
                                setFormData({...formData, image_urls: updated})
                              }}
                              style={{position:'absolute', top:2, right:2, background:'rgba(0,0,0,0.8)', border:'none', color:'#ff3333', width:'18px', height:'18px', borderRadius:'4px', fontSize:'0.7rem', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}
                              title="Supprimer cette image"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Show new files selected to be uploaded */}
                    {formData.files && formData.files.length > 0 && (
                      <div style={{color:'var(--accent)', fontSize:'0.85rem', marginBottom:'10px'}}>
                        📂 {formData.files.length} nouvelle(s) image(s) sélectionnée(s)
                      </div>
                    )}
                    
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={e => {
                        const newFiles = Array.from(e.target.files)
                        setFormData({...formData, files: [...(formData.files || []), ...newFiles]})
                      }} 
                    />
                    
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

                    {/* Customization Toggle */}
                    <div className="admin-row-checkbox" style={{display:'flex', alignItems:'center', gap:'10px', marginTop:'8px'}}>
                      <input type="checkbox" id="is_customizable" checked={formData.is_customizable !== false} onChange={e => setFormData({...formData, is_customizable: e.target.checked})} style={{width:'auto', margin:0}} />
                      <label htmlFor="is_customizable" style={{color:'#fff', fontSize:'0.9rem', cursor:'pointer'}}>🎨 Produit Personnalisable (Demande un pseudo graffiti à l'achat)</label>
                    </div>

                    {/* Sizes Toggle */}
                    <div className="admin-row-checkbox" style={{display:'flex', alignItems:'center', gap:'10px', marginTop:'8px', marginBottom:'12px'}}>
                      <input type="checkbox" id="has_sizes" checked={formData.has_sizes === true} onChange={e => setFormData({...formData, has_sizes: e.target.checked})} style={{width:'auto', margin:0}} />
                      <label htmlFor="has_sizes" style={{color:'#fff', fontSize:'0.9rem', cursor:'pointer'}}>👕 Produit avec Tailles (XS, S, M, L, XL, XXL)</label>
                    </div>
                  </>
                )}

                {activeForm === 'team' && (
                  <>
                    <input type="text" placeholder="Pseudo du Rider" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <input type="text" placeholder="URL Photo du Rider (optionnel)" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} />
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

                {activeForm === 'bike_edit' && (
                  <>
                    <label className="admin-label" style={{ color: 'var(--text-muted)' }}>📋 Identifiant de la Moto (Lecture seule)</label>
                    <input type="text" value={formData.id} readOnly style={{ background: 'rgba(255,255,255,0.02)', opacity: 0.7, color: 'var(--accent)', fontWeight: 'bold' }} />

                    <label className="admin-label">🏷️ Titre de la Moto</label>
                    <input type="text" placeholder="Titre de la moto" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />

                    <label className="admin-label">🔢 Plaque / Numéro</label>
                    <input type="text" placeholder="Ex: N° 1" value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value})} required />

                    <label className="admin-label">📝 Description de la Machine</label>
                    <textarea placeholder="Description complète..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={4} required style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', padding: '10px', fontSize: '0.9rem', outline: 'none' }} />

                    <label className="admin-label">🖼️ Photos de la Moto (Plusieurs possibles)</label>
                    {/* Render current images with delete buttons */}
                    {formData.image_urls && formData.image_urls.length > 0 && (
                      <div style={{display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'12px'}}>
                        {formData.image_urls.map((url, idx) => (
                          <div key={idx} style={{position:'relative', width:'60px', height:'60px', borderRadius:'6px', overflow:'hidden', border:'1px solid rgba(255,255,255,0.2)'}}>
                            <img src={url} alt="Aperçu" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                            <button 
                              type="button" 
                              onClick={() => {
                                const updated = formData.image_urls.filter((_, i) => i !== idx)
                                setFormData({...formData, image_urls: updated})
                              }}
                              style={{position:'absolute', top:2, right:2, background:'rgba(0,0,0,0.8)', border:'none', color:'#ff3333', width:'18px', height:'18px', borderRadius:'4px', fontSize:'0.7rem', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}
                              title="Supprimer cette image"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {formData.files && formData.files.length > 0 && (
                      <div style={{color:'var(--accent)', fontSize:'0.85rem', marginBottom:'10px'}}>
                        📂 {formData.files.length} nouvelle(s) image(s) sélectionnée(s)
                      </div>
                    )}
                    
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={e => {
                        const newFiles = Array.from(e.target.files)
                        setFormData({...formData, files: [...(formData.files || []), ...newFiles]})
                      }} 
                    />

                    <label className="admin-label">⚙️ Fiche Technique (Caractéristiques)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '10px' }}>
                      {Object.keys(formData.specs || {}).map(key => (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{key}</span>
                          <input 
                            type="text" 
                            value={formData.specs[key]} 
                            onChange={e => {
                              const updatedSpecs = { ...formData.specs, [key]: e.target.value }
                              setFormData({...formData, specs: updatedSpecs})
                            }} 
                            required 
                          />
                        </div>
                      ))}
                    </div>
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
      {/* ─── Premium Fullscreen Lightbox Overlay ─── */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightboxImage} alt="Agrandissement" className="lightbox-img" />
          </div>
        </div>
      )}
    </>
  )
}

export default App
