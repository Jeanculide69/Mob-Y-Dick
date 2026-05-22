/**
 * ContactMessagesAdmin — Boîte de réception des messages envoyés via le
 * formulaire de contact du footer (table public.contact_messages).
 *
 * Filtre par statut (nouveau / lu / résolu), tri chronologique, actions :
 *   - Marquer lu / résolu
 *   - Ajouter des notes internes
 *   - Supprimer (RGPD : droit à l'effacement)
 *
 * RLS : seul role='admin' peut lire/écrire (cf. v30).
 */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const CATEGORY_LABELS = {
  bug: '🐞 Bug technique',
  achat: '🛒 Question achat',
  rgpd: '🔒 RGPD',
  reclamation: '⚠️ Réclamation',
  autre: '💬 Autre',
}

const STATUS_LABELS = {
  nouveau: '🆕 Nouveau',
  lu: '👁️ Lu',
  resolu: '✅ Résolu',
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function ContactMessagesAdmin() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'nouveau' | 'lu' | 'resolu'
  const [filterCategory, setFilterCategory] = useState('all')
  const [editingNotesFor, setEditingNotesFor] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[contact_messages] load failed', error)
    }
    setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (filterStatus !== 'all' && m.status !== filterStatus) return false
      if (filterCategory !== 'all' && m.category !== filterCategory) return false
      return true
    })
  }, [messages, filterStatus, filterCategory])

  const counts = useMemo(() => ({
    total: messages.length,
    nouveau: messages.filter(m => m.status === 'nouveau').length,
    lu: messages.filter(m => m.status === 'lu').length,
    resolu: messages.filter(m => m.status === 'resolu').length,
  }), [messages])

  const updateStatus = async (id, newStatus) => {
    const patch = { status: newStatus }
    if (newStatus !== 'nouveau') {
      patch.handled_at = new Date().toISOString()
    }
    const { error } = await supabase.from('contact_messages').update(patch).eq('id', id)
    if (error) {
      console.error('[contact_messages] status update failed', error)
      return
    }
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  const saveNotes = async (id) => {
    const { error } = await supabase
      .from('contact_messages')
      .update({ admin_notes: notesDraft || null })
      .eq('id', id)
    if (error) {
      console.error('[contact_messages] notes update failed', error)
      return
    }
    setMessages(prev => prev.map(m => m.id === id ? { ...m, admin_notes: notesDraft || null } : m))
    setEditingNotesFor(null)
    setNotesDraft('')
  }

  const deleteMessage = async (id) => {
    if (!window.confirm('Supprimer définitivement ce message ? (RGPD : droit à l\'effacement)')) return
    const { error } = await supabase.from('contact_messages').delete().eq('id', id)
    if (error) {
      console.error('[contact_messages] delete failed', error)
      return
    }
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  if (loading) {
    return (
      <div style={{padding:'40px 20px', textAlign:'center', color:'var(--text-secondary)'}}>
        Chargement de la boîte de réception…
      </div>
    )
  }

  return (
    <div style={{padding:'8px 4px'}}>
      {/* Stats top */}
      <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px'}}>
        <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', flex:'1', minWidth:'120px'}}>
          <div style={{fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px'}}>Total</div>
          <div style={{fontSize:'1.5rem', fontWeight:700, color:'#fff'}}>{counts.total}</div>
        </div>
        <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(255,85,0,0.08)', border:'1px solid rgba(255,85,0,0.25)', flex:'1', minWidth:'120px'}}>
          <div style={{fontSize:'0.7rem', color:'#ff9966', textTransform:'uppercase', letterSpacing:'1px'}}>À traiter</div>
          <div style={{fontSize:'1.5rem', fontWeight:700, color:'var(--accent)'}}>{counts.nouveau}</div>
        </div>
        <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', flex:'1', minWidth:'120px'}}>
          <div style={{fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px'}}>Lus</div>
          <div style={{fontSize:'1.5rem', fontWeight:700, color:'#fff'}}>{counts.lu}</div>
        </div>
        <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(0,204,102,0.08)', border:'1px solid rgba(0,204,102,0.25)', flex:'1', minWidth:'120px'}}>
          <div style={{fontSize:'0.7rem', color:'#88ddaa', textTransform:'uppercase', letterSpacing:'1px'}}>Résolus</div>
          <div style={{fontSize:'1.5rem', fontWeight:700, color:'#00cc66'}}>{counts.resolu}</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px'}}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{padding:'8px 12px', background:'#111', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#fff'}}
        >
          <option value="all">Tous les statuts</option>
          <option value="nouveau">🆕 Nouveaux</option>
          <option value="lu">👁️ Lus</option>
          <option value="resolu">✅ Résolus</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{padding:'8px 12px', background:'#111', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#fff'}}
        >
          <option value="all">Toutes catégories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, lbl]) => (
            <option key={key} value={key}>{lbl}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={load}
          title="Rafraîchir"
        >
          🔄 Rafraîchir
        </button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div style={{padding:'40px 20px', textAlign:'center', color:'var(--text-muted)'}}>
          Aucun message pour ce filtre.
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
          {filtered.map(m => {
            const isEditing = editingNotesFor === m.id
            return (
              <div
                key={m.id}
                style={{
                  padding:'14px 16px',
                  borderRadius:'12px',
                  background: m.status === 'nouveau'
                    ? 'rgba(255,85,0,0.06)'
                    : 'rgba(255,255,255,0.03)',
                  border: m.status === 'nouveau'
                    ? '1px solid rgba(255,85,0,0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px', marginBottom:'8px', flexWrap:'wrap'}}>
                  <div>
                    <span style={{fontSize:'0.78rem', color:'var(--text-secondary)', fontWeight:600}}>
                      {CATEGORY_LABELS[m.category] || m.category}
                    </span>
                    <span style={{margin:'0 8px', color:'var(--text-muted)'}}>·</span>
                    <span style={{fontSize:'0.78rem', color:'var(--text-muted)'}}>
                      {fmtDate(m.created_at)}
                    </span>
                  </div>
                  <span style={{
                    fontSize:'0.72rem',
                    padding:'3px 10px',
                    borderRadius:'12px',
                    background: m.status === 'nouveau' ? 'rgba(255,85,0,0.2)'
                              : m.status === 'lu' ? 'rgba(255,255,255,0.08)'
                              : 'rgba(0,204,102,0.18)',
                    color: m.status === 'nouveau' ? '#ff9966'
                         : m.status === 'lu' ? 'var(--text-secondary)'
                         : '#88ddaa',
                    fontWeight:600,
                  }}>
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>

                <a
                  href={`mailto:${m.email}?subject=Re%3A%20%5BMob%20Y%20Dick%5D%20${encodeURIComponent(CATEGORY_LABELS[m.category] || 'Votre message')}`}
                  style={{fontSize:'0.88rem', color:'var(--accent)', textDecoration:'none', fontWeight:600}}
                >
                  📧 {m.email}
                </a>

                <div style={{
                  marginTop:'8px',
                  padding:'10px 12px',
                  borderRadius:'8px',
                  background:'rgba(0,0,0,0.25)',
                  border:'1px solid rgba(255,255,255,0.05)',
                  fontSize:'0.88rem',
                  color:'#fff',
                  whiteSpace:'pre-wrap',
                  lineHeight:'1.5',
                }}>
                  {m.message}
                </div>

                {/* Notes admin */}
                {isEditing ? (
                  <div style={{marginTop:'8px'}}>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Notes internes (visibles admin only)..."
                      rows={2}
                      style={{width:'100%', padding:'8px 10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'#fff', fontSize:'0.82rem', resize:'vertical'}}
                    />
                    <div style={{display:'flex', gap:'6px', marginTop:'6px'}}>
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => saveNotes(m.id)}>💾 Enregistrer</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setEditingNotesFor(null); setNotesDraft('') }}>Annuler</button>
                    </div>
                  </div>
                ) : m.admin_notes ? (
                  <div style={{marginTop:'8px', padding:'8px 10px', borderRadius:'8px', background:'rgba(255,215,0,0.06)', border:'1px dashed rgba(255,215,0,0.25)', fontSize:'0.78rem', color:'#ffe066'}}>
                    📝 <strong>Note admin :</strong> {m.admin_notes}
                  </div>
                ) : null}

                {/* Actions */}
                <div style={{display:'flex', gap:'6px', marginTop:'10px', flexWrap:'wrap'}}>
                  {m.status === 'nouveau' && (
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => updateStatus(m.id, 'lu')}>👁️ Marquer lu</button>
                  )}
                  {m.status !== 'resolu' && (
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => updateStatus(m.id, 'resolu')}>✅ Marquer résolu</button>
                  )}
                  {m.status === 'resolu' && (
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => updateStatus(m.id, 'nouveau')}>↩️ Rouvrir</button>
                  )}
                  {!isEditing && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => { setEditingNotesFor(m.id); setNotesDraft(m.admin_notes || '') }}
                    >
                      📝 {m.admin_notes ? 'Modifier note' : 'Ajouter note'}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    style={{marginLeft:'auto', color:'#ff7575'}}
                    onClick={() => deleteMessage(m.id)}
                    title="Supprimer définitivement (RGPD)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
