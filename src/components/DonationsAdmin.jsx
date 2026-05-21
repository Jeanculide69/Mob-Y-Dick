/**
 * DonationsAdmin — Historique des dons et des déclenchements d'emotes
 *
 * Deux onglets :
 *  - 💰 Dons (donations) : liste paginée avec total + filtrage par session
 *  - 🎉 Triggers emotes (emote_triggers) : stats par emote + log brut
 */
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './DonationsAdmin.css'

const PAGE_SIZE = 25

const fmtDate = (iso) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

const fmtMoney = (cents) => `${(cents / 100).toFixed(2)} €`

export default function DonationsAdmin({ onClose }) {
  const [tab, setTab] = useState('donations')
  const [loading, setLoading] = useState(true)
  const [donations, setDonations] = useState([])
  const [triggers, setTriggers] = useState([])
  const [shopItems, setShopItems] = useState([])
  const [sessions, setSessions] = useState([])
  const [filterSessionId, setFilterSessionId] = useState('')
  const [page, setPage] = useState(0)

  const load = async () => {
    setLoading(true)
    const [d, t, s, sh] = await Promise.all([
      supabase.from('donations').select('*').order('created_at', { ascending: false }),
      supabase.from('emote_triggers').select('*').order('triggered_at', { ascending: false }),
      supabase.from('race_sessions').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('shop_items').select('slug, name, emoji, price_cents'),
    ])
    setDonations(d.data || [])
    setTriggers(t.data || [])
    setSessions(s.data || [])
    setShopItems(sh.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Donations filtrées ──
  const filteredDonations = filterSessionId
    ? donations.filter(d => d.session_id === filterSessionId)
    : donations

  const totalCents = filteredDonations.reduce((acc, d) => acc + (d.amount_cents || 0), 0)
  const pagedDonations = filteredDonations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filteredDonations.length / PAGE_SIZE))

  // ── Triggers filtrés + groupés par slug ──
  const filteredTriggers = filterSessionId
    ? triggers.filter(t => t.session_id === filterSessionId)
    : triggers

  const triggerStats = (() => {
    const byslug = new Map()
    filteredTriggers.forEach(t => {
      byslug.set(t.item_slug, (byslug.get(t.item_slug) || 0) + 1)
    })
    return [...byslug.entries()]
      .map(([slug, count]) => {
        const item = shopItems.find(s => s.slug === slug)
        return { slug, count, name: item?.name || slug, emoji: item?.emoji || '🎉' }
      })
      .sort((a, b) => b.count - a.count)
  })()

  if (loading) {
    return (
      <div className="donations-admin-loading">
        <div className="donations-admin-spinner" />
        <p>Chargement de l'historique...</p>
      </div>
    )
  }

  return (
    <div className="donations-admin">
      {/* ── Tabs ── */}
      <div className="donations-admin-tabs">
        <button
          className={`donations-admin-tab ${tab === 'donations' ? 'active' : ''}`}
          onClick={() => { setTab('donations'); setPage(0) }}
        >
          💰 Dons <span className="donations-admin-tab-count">{donations.length}</span>
        </button>
        <button
          className={`donations-admin-tab ${tab === 'triggers' ? 'active' : ''}`}
          onClick={() => { setTab('triggers'); setPage(0) }}
        >
          🎉 Emotes déclenchées <span className="donations-admin-tab-count">{triggers.length}</span>
        </button>
      </div>

      {/* ── Filtre session ── */}
      <div className="donations-admin-filters">
        <label>
          <span className="donations-admin-filter-label">Filtrer par session :</span>
          <select
            value={filterSessionId}
            onChange={(e) => { setFilterSessionId(e.target.value); setPage(0) }}
          >
            <option value="">— Toutes les sessions —</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.id.slice(0, 8)} — {fmtDate(s.created_at)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Onglet Dons ── */}
      {tab === 'donations' && (
        <>
          <div className="donations-admin-summary">
            <div className="donations-admin-stat">
              <span className="donations-admin-stat-label">Total reçu</span>
              <span className="donations-admin-stat-value">{fmtMoney(totalCents)}</span>
            </div>
            <div className="donations-admin-stat">
              <span className="donations-admin-stat-label">Nombre de dons</span>
              <span className="donations-admin-stat-value">{filteredDonations.length}</span>
            </div>
            <div className="donations-admin-stat">
              <span className="donations-admin-stat-label">Don moyen</span>
              <span className="donations-admin-stat-value">
                {filteredDonations.length ? fmtMoney(totalCents / filteredDonations.length) : '—'}
              </span>
            </div>
          </div>

          {pagedDonations.length === 0 ? (
            <div className="donations-admin-empty">Aucun don pour ce filtre.</div>
          ) : (
            <div className="donations-admin-list">
              {pagedDonations.map(d => {
                // Détecte le provider : prio à payment_provider (v22+), sinon
                // fallback sur le format de paypal_order_id (pi_xxx = Stripe).
                const provider = d.payment_provider
                  || (d.paypal_order_id?.startsWith('pi_') ? 'stripe' : (d.paypal_order_id ? 'paypal' : null))
                // URL vers le dashboard Stripe (live ou test selon le mode)
                const stripeUrl = provider === 'stripe' && d.paypal_order_id
                  ? `https://dashboard.stripe.com/payments/${d.paypal_order_id}`
                  : null
                return (
                  <div key={d.id} className="donations-admin-row">
                    <div className="donations-admin-row-amount">{fmtMoney(d.amount_cents)}</div>
                    <div className="donations-admin-row-content">
                      <div className="donations-admin-row-header">
                        <strong>{d.display_name}</strong>
                        <span className="donations-admin-row-date">{fmtDate(d.created_at)}</span>
                      </div>
                      {d.message && <div className="donations-admin-row-message">"{d.message}"</div>}

                      {/* Infos payeur enrichies */}
                      <div className="donations-admin-row-payer">
                        {d.payer_email && (
                          <a
                            href={`mailto:${d.payer_email}`}
                            className="donations-admin-row-email"
                            title="Envoyer un mail au donateur"
                          >📧 {d.payer_email}</a>
                        )}
                        {d.card_brand && d.card_last4 && (
                          <span className="donations-admin-row-card">
                            💳 {d.card_brand} •••• {d.card_last4}
                          </span>
                        )}
                        {provider && (
                          <span className={`donations-admin-row-provider provider-${provider}`}>
                            {provider === 'stripe' ? '⚡ Stripe' : '💼 PayPal'}
                          </span>
                        )}
                      </div>

                      {/* Liens vers reçu + dashboard Stripe */}
                      <div className="donations-admin-row-actions">
                        {d.receipt_url && (
                          <a
                            href={d.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="donations-admin-row-link"
                          >📄 Reçu</a>
                        )}
                        {stripeUrl && (
                          <a
                            href={stripeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="donations-admin-row-link"
                          >🔗 Voir sur Stripe</a>
                        )}
                      </div>

                      {d.paypal_order_id && (
                        <div className="donations-admin-row-meta">
                          ID : <code>{d.paypal_order_id}</code>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="donations-admin-pagination">
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Précédent
              </button>
              <span className="donations-admin-page-info">
                Page {page + 1} / {totalPages}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Onglet Triggers ── */}
      {tab === 'triggers' && (
        <>
          <div className="donations-admin-summary">
            <div className="donations-admin-stat">
              <span className="donations-admin-stat-label">Triggers totaux</span>
              <span className="donations-admin-stat-value">{filteredTriggers.length}</span>
            </div>
            <div className="donations-admin-stat">
              <span className="donations-admin-stat-label">Emotes uniques</span>
              <span className="donations-admin-stat-value">{triggerStats.length}</span>
            </div>
          </div>

          {triggerStats.length > 0 && (
            <div className="donations-admin-stats-grid">
              {triggerStats.map(s => (
                <div key={s.slug} className="donations-admin-stat-card">
                  <span className="donations-admin-stat-card-emoji">{s.emoji}</span>
                  <span className="donations-admin-stat-card-name">{s.name}</span>
                  <span className="donations-admin-stat-card-count">×{s.count}</span>
                </div>
              ))}
            </div>
          )}

          <h4 className="donations-admin-section-title">Log brut (50 derniers)</h4>
          {filteredTriggers.length === 0 ? (
            <div className="donations-admin-empty">Aucun déclenchement pour ce filtre.</div>
          ) : (
            <div className="donations-admin-trigger-log">
              {filteredTriggers.slice(0, 50).map(t => {
                const item = shopItems.find(s => s.slug === t.item_slug)
                return (
                  <div key={t.id} className="donations-admin-trigger-row">
                    <span className="donations-admin-trigger-emoji">{item?.emoji || '🎉'}</span>
                    <span className="donations-admin-trigger-name">{item?.name || t.item_slug}</span>
                    <span className="donations-admin-trigger-user">par <strong>{t.display_name}</strong></span>
                    <span className="donations-admin-trigger-date">{fmtDate(t.triggered_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {onClose && (
        <div className="donations-admin-footer">
          <button className="btn btn-ghost" onClick={load}>🔄 Rafraîchir</button>
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        </div>
      )}
    </div>
  )
}
