/**
 * AdminDashboard — Cockpit admin de Mob Y Dick.
 *
 * Remplace l'ancien dropdown 🛠️ Admin par une vraie page :
 *  - "À traiter" : les 4 cartes prioritaires (Commandes, Sponsors,
 *    Affiliations, Messages) avec badge + dernier item en pied de carte
 *  - "Aperçu" : compteurs froids (event count, gallery count, etc.)
 *  - "Gestion" : grille d'accès rapide à TOUS les modules admin
 *
 * Tous les click renvoient au système existant de modals (handleOpenForm),
 * donc rien à toucher côté workflows métier — on remplace seulement la
 * porte d'entrée.
 */
import './AdminDashboard.css'

const formatDateShort = (iso) => {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  } catch {
    return null
  }
}

const PriorityCard = ({ icon, title, count, latest, accent, onClick, ctaLabel }) => (
  <button
    type="button"
    className={`admin-dash-card admin-dash-priority admin-dash-priority-${accent}`}
    onClick={onClick}
  >
    <div className="admin-dash-priority-top">
      <span className="admin-dash-icon">{icon}</span>
      {count > 0 ? (
        <span className="admin-dash-count-badge">{count}</span>
      ) : (
        <span className="admin-dash-count-badge admin-dash-count-zero">0</span>
      )}
    </div>
    <h3 className="admin-dash-priority-title">{title}</h3>
    {latest ? (
      <div className="admin-dash-priority-latest">
        <span className="admin-dash-latest-label">Dernier :</span>
        <span className="admin-dash-latest-text">{latest.text}</span>
        {latest.date && <span className="admin-dash-latest-date">{latest.date}</span>}
      </div>
    ) : (
      <div className="admin-dash-priority-latest admin-dash-priority-empty">
        Rien en attente 🎉
      </div>
    )}
    <span className="admin-dash-cta">{ctaLabel} →</span>
  </button>
)

const StatTile = ({ icon, value, label }) => (
  <div className="admin-dash-stat">
    <span className="admin-dash-stat-icon">{icon}</span>
    <div className="admin-dash-stat-content">
      <div className="admin-dash-stat-value">{value}</div>
      <div className="admin-dash-stat-label">{label}</div>
    </div>
  </div>
)

const ToolCard = ({ icon, label, count, onClick, accent }) => (
  <button
    type="button"
    className={`admin-dash-tool ${accent ? `admin-dash-tool-${accent}` : ''}`}
    onClick={onClick}
  >
    <span className="admin-dash-tool-icon">{icon}</span>
    <span className="admin-dash-tool-label">{label}</span>
    {typeof count === 'number' && count > 0 && (
      <span className="admin-dash-tool-count">{count}</span>
    )}
  </button>
)

export default function AdminDashboard({
  dbOrders: rawOrders,
  dbSponsors: rawSponsors,
  dbAffiliations: rawAffiliations,
  dbContactMessages: rawContact,
  dbEvents: rawEvents,
  dbGallery: rawGallery,
  dbProducts: rawProducts,
  dbTeam: rawTeam,
  dbBikes: rawBikes,
  dbUsers: rawUsers,
  onOpenForm,
  onInitializeDatabase,
  onNavigateHome,
  siteVersion,
}) {
  // Certains states App.jsx démarrent à `null` puis se peuplent — on
  // coalesce ici pour que .filter/.length ne pètent jamais avant le chargement.
  const dbOrders = rawOrders || []
  const dbSponsors = rawSponsors || []
  const dbAffiliations = rawAffiliations || []
  const dbContactMessages = rawContact || []
  const dbEvents = rawEvents || []
  const dbGallery = rawGallery || []
  const dbProducts = rawProducts || []
  const dbTeam = rawTeam || []
  const dbBikes = rawBikes || []
  const dbUsers = rawUsers || []
  // ─── Compteurs à traiter ────────────────────────────────────────
  const pendingOrders = dbOrders.filter(o => o.status === 'En attente de paiement')
  const pendingSponsors = dbSponsors.filter(s => s.status === 'En attente')
  const pendingAffiliations = dbAffiliations.filter(a => a.status === 'pending')
  const pendingContact = dbContactMessages.filter(m => m.status === 'nouveau')
  const pendingPseudos = dbUsers.filter(u => u.display_name_status === 'pending')

  const latestPendingOrder = pendingOrders[0]
  const latestPendingSponsor = pendingSponsors[0]
  const latestPendingAffiliation = pendingAffiliations[0]
  const latestPendingContact = pendingContact[0]
  const latestPendingPseudo = pendingPseudos[0]

  // ─── Stats froides ──────────────────────────────────────────────
  const upcomingEvents = dbEvents.filter(e => {
    if (!e.date) return false
    const d = new Date(e.date)
    return !isNaN(d) && d >= new Date(new Date().toDateString())
  }).length

  const showInitButton = !dbProducts || dbProducts.length === 0

  return (
    <section className="admin-dashboard">
      <div className="admin-dash-header">
        <div>
          <h1 className="admin-dash-title">
            <span className="admin-dash-title-emoji">🛠️</span> Cockpit Admin
          </h1>
          <p className="admin-dash-subtitle">
            Vue d'ensemble de l'activité Mob Y Dick
            {siteVersion && <span className="admin-dash-version"> · {siteVersion}</span>}
          </p>
        </div>
        <button className="btn btn-ghost admin-dash-back" onClick={onNavigateHome}>
          ← Retour au site
        </button>
      </div>

      {showInitButton && (
        <div className="admin-dash-init-banner">
          <span className="admin-dash-init-icon">🚀</span>
          <div>
            <strong>Première utilisation ?</strong>
            <p>Aucun produit dans la base. Initialise la boutique pour démarrer.</p>
          </div>
          <button className="btn btn-primary" onClick={onInitializeDatabase}>
            Remplir la base
          </button>
        </div>
      )}

      {/* ─── À TRAITER ───────────────────────────────────────────── */}
      <div className="admin-dash-section">
        <div className="admin-dash-section-header">
          <h2>⚡ À traiter</h2>
          <span className="admin-dash-section-meta">
            {pendingOrders.length + pendingSponsors.length + pendingAffiliations.length + pendingContact.length + pendingPseudos.length} item(s) en attente
          </span>
        </div>
        <div className="admin-dash-grid admin-dash-grid-priority">
          <PriorityCard
            icon="✏️"
            title="Pseudos"
            count={pendingPseudos.length}
            accent="red"
            ctaLabel="Voir les pseudos"
            latest={latestPendingPseudo && {
              text: `${latestPendingPseudo.email || '?'} ➔ ${latestPendingPseudo.pending_display_name || '?'}`,
              date: null,
            }}
            onClick={() => onOpenForm('users_admin')}
          />
          <PriorityCard
            icon="📦"
            title="Commandes"
            count={pendingOrders.length}
            accent="orange"
            ctaLabel="Voir les commandes"
            latest={latestPendingOrder && {
              text: `${latestPendingOrder.customer_name || 'Client'} — ${latestPendingOrder.product_name || ''}`.slice(0, 60),
              date: formatDateShort(latestPendingOrder.created_at),
            }}
            onClick={() => onOpenForm('orders')}
          />
          <PriorityCard
            icon="🤝"
            title="Demandes sponsors"
            count={pendingSponsors.length}
            accent="purple"
            ctaLabel="Voir les sponsors"
            latest={latestPendingSponsor && {
              text: `${latestPendingSponsor.name || 'Anonyme'}${latestPendingSponsor.budget ? ' — ' + latestPendingSponsor.budget : ''}`.slice(0, 60),
              date: formatDateShort(latestPendingSponsor.created_at),
            }}
            onClick={() => onOpenForm('sponsors_admin')}
          />
          <PriorityCard
            icon="🏍️"
            title="Affiliations moto"
            count={pendingAffiliations.length}
            accent="blue"
            ctaLabel="Voir les affiliations"
            latest={latestPendingAffiliation && {
              text: `Moto #${latestPendingAffiliation.moto_number || '?'} — ${latestPendingAffiliation.profiles?.display_name || latestPendingAffiliation.profiles?.email || 'User'}`.slice(0, 60),
              date: formatDateShort(latestPendingAffiliation.requested_at),
            }}
            onClick={() => onOpenForm('affiliations_admin')}
          />
          <PriorityCard
            icon="📩"
            title="Messages contact"
            count={pendingContact.length}
            accent="green"
            ctaLabel="Voir la boîte de réception"
            latest={latestPendingContact && {
              text: `${latestPendingContact.email || '?'} (${latestPendingContact.category || 'autre'})`.slice(0, 60),
              date: formatDateShort(latestPendingContact.created_at),
            }}
            onClick={() => onOpenForm('contact_admin')}
          />
        </div>
      </div>

      {/* ─── APERÇU CHIFFRES ─────────────────────────────────────── */}
      <div className="admin-dash-section">
        <div className="admin-dash-section-header">
          <h2>📊 Aperçu</h2>
        </div>
        <div className="admin-dash-stats-grid">
          <StatTile icon="📅" value={upcomingEvents} label="Événements à venir" />
          <StatTile icon="🛍️" value={dbOrders.length} label="Commandes totales" />
          <StatTile icon="👥" value={dbUsers?.length || 0} label="Membres inscrits" />
          <StatTile icon="📸" value={dbGallery?.length || 0} label="Médias galerie" />
        </div>
      </div>

      {/* ─── GESTION DU CONTENU ──────────────────────────────────── */}
      <div className="admin-dash-section">
        <div className="admin-dash-section-header">
          <h2>🗂️ Gestion du contenu</h2>
          <span className="admin-dash-section-meta">Tous les modules d'administration</span>
        </div>
        <div className="admin-dash-grid admin-dash-grid-tools">
          <ToolCard icon="📅" label="Événements" count={dbEvents.length} onClick={() => onOpenForm('event')} />
          <ToolCard icon="📸" label="Galerie" count={dbGallery?.length || 0} onClick={() => onOpenForm('gallery')} />
          <ToolCard icon="🛍️" label="Boutique" count={dbProducts?.length || 0} onClick={() => onOpenForm('product')} />
          <ToolCard icon="👥" label="Équipe" count={dbTeam?.length || 0} onClick={() => onOpenForm('team')} />
          <ToolCard icon="🏍️" label="Motos" count={dbBikes?.length || 0} onClick={() => onOpenForm('bikes_admin')} />
          <ToolCard icon="🔗" label="Réseaux sociaux" onClick={() => onOpenForm('socials')} />
          <ToolCard icon="🎉" label="Emotes & Sons" onClick={() => onOpenForm('emotes_admin')} />
          <ToolCard icon="💬" label="Messages live" onClick={() => onOpenForm('donations_admin')} />
          <ToolCard icon="🧑‍🚀" label="Utilisateurs" count={dbUsers?.length || 0} onClick={() => onOpenForm('users_admin')} />
          <ToolCard icon="🫂" label="Teams Privées" onClick={() => onOpenForm('user_teams_admin')} />
        </div>
      </div>
    </section>
  )
}
