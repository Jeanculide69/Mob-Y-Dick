import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './Blog.css'

// Initial content-rich articles written in French to satisfy Google AdSense
const STATIC_ARTICLES = [
  {
    id: 'static-1',
    title: "L'Épopée de la Team Mob Y Dick : De la passion à la boue",
    category: "histoire",
    content: `C'est dans un coin d'atelier encombré de vieilles pièces de Peugeot 103 et de Motobécane 51 qu'est née l'histoire de la team Mob Y Dick. À l'origine, une simple bande de copains d'enfance, partageant une fascination pour la mécanique vintage et la vitesse brute. Ce qui ne devait être qu'une blague un après-midi de printemps s'est rapidement transformé en une véritable passion pour le Mobcross, cette discipline unique qui voit s'affronter des cyclomoteurs modifiés sur des pistes de terre.

Le nom "Mob Y Dick" a été choisi en hommage aux célèbres machines bleues et au mythique monstre des mers, symbolisant notre quête pour dompter nos "monstres mécaniques" récalcitrants. Nos débuts ont été marqués par beaucoup de fumée, de rires et de pannes légendaires. Lors de notre première course, aucune meule n'a franchi la ligne d'arrivée, mais l'esprit de groupe était scellé.

Au fil des saisons, l'équipe s'est structurée. Nous avons adopté nos couleurs distinctives (rouge, orange et noir) et commencé à personnaliser nos motos avec des kits déco style graffiti uniques, peints à la main. Mais notre philosophie reste inchangée :

> "Chez nous, l'esprit d'équipe et la rigolade passent toujours avant la ligne d'arrivée. On rigole fort, on s'entraide au stand, et si une meule explose au bout de trois tours, c'est simplement l'excuse idéale pour ouvrir une bière et en discuter !"

Aujourd'hui, la team compte plus de 9 riders et une équipe mécanique dévouée, prête à en découdre sur toutes les pistes de France. La passion de la boue et du 2-temps coule définitivement dans nos veines !`,
    excerpt: "Découvrez comment une bande de copains d'enfance a transformé de vieux cyclomoteurs Peugeot en véritables bêtes de course sur terre.",
    image_url: "/motos/2cd0ab6d-2472-4496-aac8-af9a290fbf14.jpg",
    read_time: 6,
    author: "Fumax (Président)",
    created_at: "2026-05-20T10:00:00Z"
  },
  {
    id: 'static-2',
    title: "Préparation Moteur & Cycle : Comment monter une Mobcross de compétition",
    category: "mecanique",
    content: `Préparer un cyclomoteur de route Peugeot 103 pour lui faire subir les assauts du Mobcross est un art subtil qui demande rigueur, ingéniosité et patience. Notre chef mécanicien, Gauthier, nous livre ici les secrets de préparation de la célèbre "Beast R-1".

### 1. La préparation moteur (Le cœ​ur du 2-temps)
Pour obtenir une accélération nerveuse à bas régime – essentielle pour s'extirper des virages boueux – nous modifions profondément le moteur :
- **Les carters d'origine** sont méticuleusement alignés avec les transferts du cylindre. Nous utilisons des clapets Athena en carbone pour optimiser le flux de gaz frais.
- **Le cylindre :** Nous restons sur une cylindrée de 50cc réglementaire pour la catégorie mais nous augmentons légèrement les diagrammes d'échappement (autour de 178°) et d'admission (120°) à la fraiseuse.
- **La carburation :** Nous installons un carburateur Dell'Orto PHBG de 15 ou 17,5 mm, avec un réglage de gicleur principal peaufiné en fonction du climat. Un filtre à air en mousse type cornet de motocross protège le tout de la poussière.
- **L'échappement :** Un pot de détente Giannelli Black Gun ou Doppler ER1, raccourci pour décaler la puissance dans les mi-régimes.

### 2. Le châ​ssis et la partie cycle (Sécurité et rigidité)
Le cadre d'origine d'un Peugeot 103 n'est pas conçu pour faire des sauts. Sans modifications, il se plierait dès le premier saut.
- **Renfort de cadre :** Nous soudons une barre centrale en acier entre la colonne de direction et le tube de selle. Les carters et le bras oscillant reçoivent des plaques de renfort soudées au TIG.
- **Le bras oscillant :** Les bras oscillants d'origine ont tendance à vriller sous la tension de la chaîne. Nous installons un bras oscillant de Peugeot RCX renforcé ou fabriquons nos propres platines rigides.
- **Suspensions :** À l'avant, nous adaptons une fourche hydraulique renforcée provenant d'une mécaboite 50cc. À l'arrière, une paire d'amortisseurs réglables à gaz de 360 mm absorbe les chocs.
- **Pneumatiques :** Des pneus Michelin StarCross 5 ou Pirelli Scorpion MX montés sur des jantes à rayons renforcées de 17 pouces complètent la monte.

> "La préparation d'une mobcross est un équilibre permanent entre puissance brute et fiabilité. Une machine hyper performante qui serre au bout de deux tours ne vous fera jamais gagner de course."`,
    excerpt: "Carburation, diagrammes de cylindre, renforts de cadre au TIG... Plongez dans les détails techniques de nos préparations Mobcross.",
    image_url: "/motos/05c88f5e-250c-41fa-bdc4-dc97b785cd54.jpg",
    read_time: 8,
    author: "Gauthier (Chef Mécano)",
    created_at: "2026-05-22T14:30:00Z"
  },
  {
    id: 'static-3',
    title: "Le Grand Récit du Championnat de France de Mobcross 2025",
    category: "competition",
    content: `La saison 2025 du Championnat de France de Mobcross restera gravée dans l'histoire de la team Mob Y Dick comme l'une des plus éprouvantes, mais aussi l'une des plus mémorables. Retour sur les temps forts d'une année riche en adrénaline.

### Nozay : L'épreuve de la poussière
La première manche s'est déroulée sous un soleil de plomb et sur une piste sèche transformée en nuage de poussière géant. 
- **Manche 1 :** Très bon départ d'Alex sur la Beast R-1 qui se faufile en 3ème position. Malheureusement, après 4 tours, son embrayage commence à patiner sévèrement à cause de la surchauffe. Il finit difficilement à la 8ème place.
- **Manche 2 :** Après un changement d'embrayage express aux stands par Gauthier et StickMan, Alex repart gonflé à bloc et arrache la 5ème place après une bataille féroce dans le dernier tour.

### Saint-Vincent-des-Landes : L'enfer de la boue
Changement radical de décor pour la seconde épreuve : une pluie battante s'est abattue sur le circuit toute la nuit, transformant la piste en un bourbier sans nom. C'est ici que l'esprit de notre team a fait la différence.
Dans ces conditions extrêmes, les moteurs chauffent et aspirent de l'eau. Bob a connu une panne d'allumage dans la première manche. Gauthier a réussi à nettoyer et à étanchéifier le rotor sous la pluie battante en moins de 15 minutes. 
Grâce à un pilotage ultra-technique dans les ornières et à la fiabilité de nos filtres à air modifiés "anti-boue", Alex parvient à décrocher la 2ème place sur le podium de la journée !

### Bilan de la saison 2025
Grâce à une régularité exemplaire lors de la finale et à une solidarité sans faille au sein des stands (nous avons prêté un carburateur de rechange à une équipe concurrente en détresse), la team Mob Y Dick décroche une fantastique **3ème place au classement général par équipe du championnat** !

Un immense merci à nos sponsors locaux et à tous les supporters venus nous encourager au bord des pistes avec leurs fumigènes orange et rouge. Rendez-vous en 2026 pour viser le titre !`,
    excerpt: "Revivez les manches mémorables de la saison 2025, de la poussière étouffante de Nozay jusqu'au podium boueux de Saint-Vincent.",
    image_url: "/motos/5e66cf75-e1de-41d7-8273-ed89eb9c8e3e.jpg",
    read_time: 7,
    author: "Alex (Rider N°1)",
    created_at: "2026-05-24T18:15:00Z"
  },
  {
    id: 'static-4',
    title: "Guide du Débutant : Comment se lancer dans le Mobcross ?",
    category: "guide",
    content: `Vous entendez le vrombissement rageur d'un moteur 2-temps, vous voyez des bécanes voler au-dessus des bosses et vous vous dites : "C'est ça qu'il me faut !" ? Vous avez raison. Le Mobcross est sans doute le sport mécanique le plus convivial, le plus fun et le plus accessible financièrement. Voici notre guide complet pour débuter dans les meilleures conditions.

### 1. Choisir sa base (Le choix de la meule)
Pour débuter, deux choix s'imposent en France :
- **Le Peugeot 103 (MVL, RCX, SPX) :** C'est la base la plus populaire. Les pièces de rechange sont abondantes, peu chères, et la mécanique est extrêmement simple à comprendre.
- **La Motobécane 51 (Club, Hard Rock, Magnum) :** Également très populaire, réputée pour son moteur AV10 très performant d'origine.

Pour vos premiers tours de roues, évitez les cadres trop modifiés. Trouvez une base saine d'origine, démontez-la entièrement pour nettoyer le réservoir, et commencez par y greffer une barre de renfort centrale soudée.

### 2. L'équipement de sécurité (Priorité absolue)
Même si l'on roule sur un cyclo de 50cc, les chutes font mal et la sécurité ne doit jamais être négligée. L'équipement obligatoire comprend :
- Un casque de motocross homologué.
- Des lunettes de protection (masque) anti-poussière.
- Une dorsale et un pare-pierres homologués FFM.
- Des bottes de motocross rigides (les baskets sont strictement interdites sur circuit).
- Des gants renforcés et une tenue en tissu résistant (pantalon et maillot de cross).

### 3. La licence et les clubs
Pour rouler en toute légalité et être couvert par les assurances, vous devez adhérer à un club affilié à la Fédération Française de Motocyclisme (FFM) ou à l'UFOLEP. Vous passerez un examen médical d'aptitude et obtiendrez votre licence annuelle de compétition ou d'entraînement.

### 4. Le budget estimé pour débuter
L'un des grands points forts du Mobcross est son coût dérisoire comparé au Motocross moderne :
- **Achat du cyclo d'occasion :** 300 € à 600 €
- **Pièces de préparation de base & pneus cross :** 250 €
- **Équipement de protection complet :** 300 €
- **Licence annuelle :** 150 €
- **Budget total estimé :** Environ 1000 € à 1300 € pour une première saison complète !

N'hésitez pas à venir nous voir lors des entraînements de la team Mob Y Dick ou à nous envoyer un message via notre formulaire de contact, nous serons ravis de vous conseiller pour votre premier montage !`,
    excerpt: "Vous rêvez de tâter de la terre en 50cc ? Voici les conseils de la team pour choisir sa mobylette, s'équiper et obtenir sa licence.",
    image_url: "/motos/6c3be747-ab9a-4ae3-8414-d6e23a6698fe.jpg",
    read_time: 5,
    author: "Bob (Pilote & Logistique)",
    created_at: "2026-05-25T09:00:00Z"
  }
]

const SQL_CREATE_TABLE = `-- Requête de création de la table blog
CREATE TABLE IF NOT EXISTS blog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  image_url TEXT,
  read_time INTEGER NOT NULL DEFAULT 5,
  author TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE blog ENABLE ROW LEVEL SECURITY;

-- Autoriser la lecture publique
CREATE POLICY "Public read blog" ON blog FOR SELECT USING (true);

-- Autoriser l'administration aux utilisateurs authentifiés
CREATE POLICY "Auth insert blog" ON blog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update blog" ON blog FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete blog" ON blog FOR DELETE TO authenticated USING (true);`

const Blog = ({ hasPermission, isAdmin, profile, navigate }) => {
  const [articles, setArticles] = useState([])
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)

  // Editor states
  const [showEditor, setShowEditor] = useState(false)
  const [editingArticle, setEditingArticle] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    category: 'mecanique',
    content: '',
    excerpt: '',
    image_url: '',
    read_time: 5,
    author: ''
  })
  const [submitting, setSubmitting] = useState(false)

  const canManage = hasPermission('manage_blog') || isAdmin || (profile && ['moderator', 'organisateur'].includes(profile.role))

  const fetchArticles = async () => {
    setLoading(true)
    if (!supabase) {
      setArticles(STATIC_ARTICLES)
      setDbError(true)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('blog')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        setArticles(data)
      } else {
        // Table exists but is empty, pre-populate with static articles in state
        setArticles(STATIC_ARTICLES)
      }
      setDbError(false)
    } catch (err) {
      console.warn("Supabase blog fetch failed, using fallback static articles.", err)
      setArticles(STATIC_ARTICLES)
      // Check if error is due to missing relation (table doesn't exist)
      if (err.message && (err.message.includes('relation "blog" does not exist') || err.code === '42P01')) {
        setDbError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles()
  }, [])

  const handleOpenAdd = () => {
    setEditingArticle(null)
    setFormData({
      title: '',
      category: 'mecanique',
      content: '',
      excerpt: '',
      image_url: '',
      read_time: 5,
      author: profile?.display_name || profile?.email?.split('@')[0] || 'Admin'
    })
    setShowEditor(true)
  }

  const handleOpenEdit = (e, article) => {
    e.stopPropagation()
    setEditingArticle(article)
    setFormData({
      title: article.title,
      category: article.category,
      content: article.content,
      excerpt: article.excerpt || '',
      image_url: article.image_url || '',
      read_time: article.read_time || 5,
      author: article.author || 'Admin'
    })
    setShowEditor(true)
  }

  const handleDelete = async (e, articleId) => {
    e.stopPropagation()
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) return

    if (String(articleId).startsWith('static-')) {
      // For fallback articles, just filter out from state
      setArticles(prev => prev.filter(a => a.id !== articleId))
      if (selectedArticle && selectedArticle.id === articleId) {
        setSelectedArticle(null)
      }
      return
    }

    try {
      const { error } = await supabase.from('blog').delete().eq('id', articleId)
      if (error) throw error
      fetchArticles()
      if (selectedArticle && selectedArticle.id === articleId) {
        setSelectedArticle(null)
      }
    } catch (err) {
      alert("Erreur lors de la suppression : " + err.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    if (dbError) {
      // In offline/fallback mode, simulate saving directly in state
      const now = new Date().toISOString()
      if (editingArticle) {
        setArticles(prev => prev.map(a => a.id === editingArticle.id ? { ...a, ...formData } : a))
        if (selectedArticle && selectedArticle.id === editingArticle.id) {
          setSelectedArticle({ ...selectedArticle, ...formData })
        }
      } else {
        const newArt = {
          id: 'static-' + Date.now(),
          ...formData,
          created_at: now
        }
        setArticles(prev => [newArt, ...prev])
      }
      setShowEditor(false)
      setSubmitting(false)
      return
    }

    try {
      if (editingArticle) {
        const { error } = await supabase
          .from('blog')
          .update(formData)
          .eq('id', editingArticle.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('blog')
          .insert([formData])
        if (error) throw error
      }
      setShowEditor(false)
      fetchArticles()
      // If we are currently viewing the edited article, update it
      if (editingArticle && selectedArticle && selectedArticle.id === editingArticle.id) {
        setSelectedArticle({ ...selectedArticle, ...formData })
      }
    } catch (err) {
      alert("Erreur lors de la sauvegarde : " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'mecanique': return '🔧 Mécanique'
      case 'histoire': return '📚 Histoire'
      case 'competition': return '🏆 Compétition'
      case 'guide': return '💡 Guide'
      default: return '📝 Article'
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <section className="section page-top">
      <div className="container">
        
        {/* Back button & title logic */}
        {!selectedArticle ? (
          <div className="section-header">
            <span className="section-tag">Blog & Actualités</span>
            <h2>La Vie de la Team</h2>
            <p className="section-sub">
              Tutoriels mécaniques, récits épiques de courses et chroniques de la meute.
            </p>
            {canManage && (
              <button className="btn btn-primary btn-sm inline-add-btn" onClick={handleOpenAdd}>
                ➕ Ajouter un Article
              </button>
            )}
          </div>
        ) : (
          <button className="blog-back-btn" onClick={() => setSelectedArticle(null)}>
            ← Retour aux articles
          </button>
        )}

        {/* Database notice warning for Admins */}
        {dbError && canManage && !selectedArticle && (
          <div className="blog-sql-alert">
            <h4 className="text-accent" style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 'bold' }}>
              🔧 Activation de l'édition dynamique du Blog (Supabase)
            </h4>
            <p>
              La table <code>blog</code> n'existe pas encore dans votre base de données Supabase. Pour pouvoir ajouter, modifier ou supprimer des articles directement depuis ce cockpit, copiez la requête SQL ci-dessous, allez dans votre <strong>Dashboard Supabase</strong> → <strong>SQL Editor</strong> → cliquez sur <strong>New Query</strong>, collez-la et cliquez sur <strong>Run</strong>.
            </p>
            <textarea readOnly value={SQL_CREATE_TABLE} onClick={(e) => e.target.select()} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              💡 Cliquez dans le champ pour tout sélectionner. En attendant, le site affiche les articles de démonstration ci-dessous en mode lecture seule sécurisé.
            </span>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh', gap: '12px', color: 'var(--text-muted)' }}>
            <span style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Chargement des articles...
          </div>
        ) : (
          <>
            {/* GRID OF ARTICLES */}
            {!selectedArticle ? (
              articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '2.5rem' }}>📝</span>
                  <p style={{ margin: '15px 0 0 0' }}>Aucun article n'a été publié pour le moment.</p>
                </div>
              ) : (
                <div className="blog-grid">
                  {articles.map((art) => (
                    <div 
                      key={art.id} 
                      className="blog-card"
                      onClick={() => setSelectedArticle(art)}
                    >
                      {/* Admin actions overlay */}
                      {canManage && (
                        <div className="blog-card-admin-actions">
                          <button 
                            className="blog-admin-btn edit" 
                            onClick={(e) => handleOpenEdit(e, art)}
                            title="Modifier"
                          >
                            ✏️
                          </button>
                          <button 
                            className="blog-admin-btn delete" 
                            onClick={(e) => handleDelete(e, art.id)}
                            title="Supprimer"
                          >
                            🗑️
                          </button>
                        </div>
                      )}

                      <div className="blog-card-img-wrap">
                        {art.image_url ? (
                          <img src={art.image_url} alt={art.title} className="blog-card-img" loading="lazy" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1f1f1f, #0d0d0d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
                            🏍️
                          </div>
                        )}
                      </div>

                      <div className="blog-card-content">
                        <div className="blog-meta">
                          <span className={`blog-badge ${art.category || 'mecanique'}`}>
                            {getCategoryLabel(art.category)}
                          </span>
                          <span className="blog-read-time">
                            ⏱️ {art.read_time || 5} min
                          </span>
                        </div>

                        <h3 className="blog-card-title">{art.title}</h3>
                        <p className="blog-card-desc">
                          {art.excerpt || (art.content ? art.content.slice(0, 120) + '...' : '')}
                        </p>

                        <div className="blog-card-footer">
                          <span className="blog-date">{formatDate(art.created_at)}</span>
                          <button className="blog-more-btn">
                            Lire la suite →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* DETAILED VIEW */
              <div className="article-container">
                <div className="article-hero">
                  {selectedArticle.image_url ? (
                    <img src={selectedArticle.image_url} alt={selectedArticle.title} className="article-hero-img" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1f1f1f, #0d0d0d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem' }}>
                      🏍️
                    </div>
                  )}
                  <div className="article-hero-overlay">
                    <span className={`blog-badge ${selectedArticle.category}`} style={{ width: 'fit-content' }}>
                      {getCategoryLabel(selectedArticle.category)}
                    </span>
                    <h1 className="article-title">{selectedArticle.title}</h1>
                    <div style={{ display: 'flex', gap: '15px', marginTop: '12px', fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', flexWrap: 'wrap' }}>
                      <span>👤 Par {selectedArticle.author || 'Admin'}</span>
                      <span>⏱️ {selectedArticle.read_time || 5} min de lecture</span>
                      <span>📅 Publié le {formatDate(selectedArticle.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="article-body">
                  <div className="article-content">
                    {/* Render paragraphs & blockquotes. Simple custom markdown parser. */}
                    {selectedArticle.content.split('\n\n').map((paragraph, index) => {
                      // Check for blockquote
                      if (paragraph.startsWith('>')) {
                        return (
                          <blockquote key={index}>
                            {paragraph.replace(/^>\s*"/, '').replace(/"\s*$/, '').replace(/^>\s*/, '')}
                          </blockquote>
                        )
                      }
                      
                      // Check for header h3
                      if (paragraph.startsWith('###')) {
                        return (
                          <h3 key={index}>
                            {paragraph.replace(/^###\s*/, '')}
                          </h3>
                        )
                      }

                      // Check for list items
                      if (paragraph.startsWith('-')) {
                        return (
                          <ul key={index}>
                            {paragraph.split('\n').map((item, idx) => (
                              <li key={idx} style={{ marginBottom: '8px' }}>
                                {/* Bold inside lists */}
                                {item.replace(/^-\s*/, '').split('**').map((part, pIdx) => 
                                  pIdx % 2 === 1 ? <strong key={pIdx}>{part}</strong> : part
                                )}
                              </li>
                            ))}
                          </ul>
                        )
                      }

                      // Regular paragraph with potential bold/code formats
                      return (
                        <p key={index}>
                          {paragraph.split('**').map((part, pIdx) => {
                            // Check if this part contains code tags
                            const renderCode = (text) => {
                              return text.split('`').map((subpart, sIdx) => 
                                sIdx % 2 === 1 ? <code key={sIdx}>{subpart}</code> : subpart
                              )
                            }
                            
                            return pIdx % 2 === 1 ? 
                              <strong key={pIdx}>{renderCode(part)}</strong> : 
                              <React.Fragment key={pIdx}>{renderCode(part)}</React.Fragment>
                          })}
                        </p>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ARTICLE EDITOR MODAL */}
      {showEditor && (
        <div className="blog-editor-overlay">
          <div className="blog-editor-modal glass">
            <h3>{editingArticle ? '✏️ Modifier l\'article' : '➕ Ajouter un article'}</h3>
            <form onSubmit={handleSubmit}>
              
              <div className="blog-form-group">
                <label>Titre de l'article</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                  placeholder="Ex: Préparation Moteur Peugeot 103"
                  required 
                />
              </div>

              <div className="blog-form-row">
                <div className="blog-form-group">
                  <label>Auteur</label>
                  <input 
                    type="text" 
                    value={formData.author} 
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })} 
                    placeholder="Ex: Gauthier (Chef Mécano)"
                    required 
                  />
                </div>
                
                <div className="blog-form-group">
                  <label>Temps de lecture (minutes)</label>
                  <input 
                    type="number" 
                    min="1"
                    max="60"
                    value={formData.read_time} 
                    onChange={(e) => setFormData({ ...formData, read_time: parseInt(e.target.value) || 5 })} 
                    required 
                  />
                </div>
              </div>

              <div className="blog-form-row">
                <div className="blog-form-group">
                  <label>Catégorie</label>
                  <select 
                    value={formData.category} 
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="mecanique">🔧 Mécanique</option>
                    <option value="histoire">📚 Histoire</option>
                    <option value="competition">🏆 Compétition</option>
                    <option value="guide">💡 Guide</option>
                  </select>
                </div>

                <div className="blog-form-group">
                  <label>URL Image d'illustration</label>
                  <input 
                    type="text" 
                    value={formData.image_url} 
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} 
                    placeholder="Ex: /motos/2cd0ab6d.jpg"
                  />
                </div>
              </div>

              <div className="blog-form-group">
                <label>Description courte (extrait)</label>
                <input 
                  type="text" 
                  value={formData.excerpt} 
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })} 
                  placeholder="Ex: Carburation, renforts... les astuces techniques de nos prépa mobcross."
                  required
                />
              </div>

              <div className="blog-form-group">
                <label>Contenu de l'article (Markdown basique supporté)</label>
                <textarea 
                  rows="12"
                  value={formData.content} 
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })} 
                  placeholder="Écrivez l'article ici... Utilisez double saut de ligne pour séparer les paragraphes. Utilisez ### pour les titres de sections et > pour les citations."
                  required
                />
              </div>

              <div className="blog-form-actions">
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => setShowEditor(false)}
                  disabled={submitting}
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={submitting}
                >
                  {submitting ? 'Enregistrement...' : '🔥 Publier'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Blog
