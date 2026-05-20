/**
 * MotoPage — Profil par numéro de moto
 *
 * SQL Supabase (à exécuter une seule fois) :
 * ─────────────────────────────────────────────────────────────────
 * create table if not exists moto_profiles (
 *   id uuid default gen_random_uuid() primary key,
 *   moto_number integer unique not null,
 *   display_name text,
 *   description text,
 *   photo_url text,
 *   updated_at timestamptz default now(),
 *   updated_by uuid references auth.users(id)
 * );
 *
 * create table if not exists moto_affiliations (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references auth.users(id) not null,
 *   moto_number integer not null,
 *   status text default 'pending',
 *   note text,
 *   requested_at timestamptz default now(),
 *   reviewed_at timestamptz,
 *   reviewed_by uuid references auth.users(id),
 *   unique(user_id, moto_number)
 * );
 *
 * alter table moto_profiles enable row level security;
 * alter table moto_affiliations enable row level security;
 * create policy "mp_read_all" on moto_profiles for select using (true);
 * create policy "ma_read_own" on moto_affiliations for select using (auth.uid() = user_id);
 * create policy "ma_insert_own" on moto_affiliations for insert with check (auth.uid() = user_id);
 * create policy "mp_write_affiliated" on moto_profiles for all using (
 *   auth.uid() in (
 *     select user_id from moto_affiliations
 *     where moto_number = moto_profiles.moto_number and status = 'approved'
 *   )
 * );
 * create policy "ma_admin_all" on moto_affiliations for all using (
 *   auth.uid() in (select id from profiles where role in ('admin','moderator'))
 * );
 * create policy "mp_admin_all" on moto_profiles for all using (
 *   auth.uid() in (select id from profiles where role in ('admin','moderator'))
 * );
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import MotoCropper from './MotoCropper'
import MotoCharts from './MotoCharts'
import './MotoPage.css'

const MAX_RAW_FILE_SIZE  = 20 * 1024 * 1024 // 20 Mo (le cropper compresse à <200 Ko)
const MAX_AFFILIATIONS  = 3                // Nombre max de pilotes affiliés par moto

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const m   = Math.floor(ms / 60000)
  const s   = Math.floor((ms % 60000) / 1000)
  const ms3 = ms % 1000
  return `${m}:${s.toString().padStart(2, '0')}.${ms3.toString().padStart(3, '0')}`
}

export default function MotoPage({ motoNumber, session, isAdmin, isModerator, onClose }) {
  // ── Data ──
  const [profile, setProfile]         = useState(null)
  const [affiliation, setAffiliation] = useState(null)
  const [stats, setStats]             = useState(null)
  const [teamHistory, setTeamHistory] = useState([])
  const [approvedUsers, setApprovedUsers] = useState([]) // noms affichés dynamiquement

  // ── UI ──
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState(false)
  const [noteText, setNoteText]       = useState('')
  const [requesting, setRequesting]   = useState(false)
  const [submitStatus, setSubmitStatus] = useState(null) // 'sent' | 'error'

  // ── Admin ──
  const [allAffiliations, setAllAffiliations] = useState([])
  const [reviewingId, setReviewingId] = useState(null)

  // ── Edit form (name + description) ──
  const [editForm, setEditForm]       = useState({ display_name: '', description: '' })
  const [saving, setSaving]           = useState(false)

  // ── Photo / Cropper ──
  const [cropperSrc, setCropperSrc]   = useState(null)   // dataURL → ouvre le cropper
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef                  = useRef(null)

  const isAffiliated = affiliation?.status === 'approved'
  const isPending    = affiliation?.status === 'pending'
  const canEdit      = isAffiliated || isAdmin || isModerator

  // ─────────────────────────────────────────

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([
      loadProfile(),
      loadStats(),
      loadApprovedUsers(),
      session ? loadAffiliation() : Promise.resolve(),
      (isAdmin || isModerator) ? loadAdminAffiliations() : Promise.resolve(),
    ])
    setLoading(false)
  }

  const loadProfile = async () => {
    const { data } = await supabase
      .from('moto_profiles')
      .select('*')
      .eq('moto_number', motoNumber)
      .maybeSingle()
    if (data) {
      setProfile(data)
      setEditForm({ display_name: data.display_name || '', description: data.description || '' })
    }
  }

  const loadStats = async () => {
    const { data: teamsData, error } = await supabase
      .from('race_teams')
      .select('*, race_sessions(id, name, status, created_at)')
      .eq('moto_number', motoNumber)

    if (error || !teamsData?.length) { setStats({ sessions: 0, totalLaps: 0 }); return }

    const teamIds = teamsData.map(t => t.id)
    const { data: lapsData } = await supabase
      .from('race_laps')
      .select('*')
      .in('team_id', teamIds)

    const laps = lapsData || []

    // Per-session history
    const history = teamsData
      .filter(t => t.race_sessions)
      .map(team => {
        const sessLaps = laps
          .filter(l => l.team_id === team.id)
          .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
        const splits = sessLaps.map((l, i) =>
          i === 0 ? l.lap_time_ms : l.lap_time_ms - sessLaps[i - 1].lap_time_ms
        )
        return {
          session: team.race_sessions,
          team,
          totalLaps: sessLaps.length,
          bestLap: splits.length ? Math.min(...splits) : null,
        }
      })
      .sort((a, b) => new Date(b.session?.created_at) - new Date(a.session?.created_at))

    // Global best lap
    const allSplits = []
    history.forEach(h => {
      const sl = laps.filter(l => l.team_id === h.team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      sl.forEach((l, i) => allSplits.push(i === 0 ? l.lap_time_ms : l.lap_time_ms - sl[i - 1].lap_time_ms))
    })

    // Podiums (simplified: count sessions where no other team in same session has more laps)
    let wins = 0, podiums = 0
    history.forEach(h => {
      const sameSession = history.filter(x => x.session?.id === h.session?.id)
      const rank = sameSession.filter(x => x.totalLaps > h.totalLaps).length
      if (rank === 0 && h.totalLaps > 0) wins++
      if (rank < 3 && h.totalLaps > 0) podiums++
    })

    setTeamHistory(history)
    setStats({
      sessions: history.length,
      totalLaps: laps.length,
      bestLap: allSplits.length ? Math.min(...allSplits) : null,
      wins,
      podiums,
      pilots: [...new Set(teamsData.map(t => t.pilot_1_name).filter(Boolean))],
    })
  }

  const loadAffiliation = async () => {
    const { data } = await supabase
      .from('moto_affiliations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('moto_number', motoNumber)
      .maybeSingle()
    setAffiliation(data)
  }

  // ─── Charger les affiliés approuvés (visible par tous) ───
  const loadApprovedUsers = async () => {
    // Récupère les user_id approuvés pour ce numéro
    const { data: affs } = await supabase
      .from('moto_affiliations')
      .select('user_id')
      .eq('moto_number', motoNumber)
      .eq('status', 'approved')

    if (!affs || affs.length === 0) { setApprovedUsers([]); return }

    // Récupère les display_name des profils
    const userIds = affs.map(a => a.user_id)
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)
    setApprovedUsers((profs || []).map(p => p.display_name).filter(Boolean))
  }

  const loadAdminAffiliations = async () => {
    // Try with the profiles join first
    let { data, error } = await supabase
      .from('moto_affiliations')
      .select('*, profiles(display_name, email)')
      .eq('moto_number', motoNumber)
      .order('requested_at', { ascending: false })

    // If the join fails (missing FK to profiles), fall back to a plain query
    if (error || !data) {
      const plain = await supabase
        .from('moto_affiliations')
        .select('*')
        .eq('moto_number', motoNumber)
        .order('requested_at', { ascending: false })
      data = plain.data || []

      // Enrich with profile info manually
      if (data.length > 0) {
        const userIds = [...new Set(data.map(a => a.user_id).filter(Boolean))]
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', userIds)
        const profMap = {}
        ;(profs || []).forEach(p => { profMap[p.id] = p })
        data = data.map(a => ({ ...a, profiles: profMap[a.user_id] || null }))
      }
    }

    setAllAffiliations(data || [])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadAll() }, [motoNumber, session?.user?.id])

  // Verrouille le scroll du body quand la page moto est ouverte
  // (sinon le classement derrière continue à scroller sous la modal)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Le bouton "retour" du téléphone ferme la page moto au lieu de quitter le site.
  useEffect(() => {
    let closedByBack = false
    window.history.pushState({ mydMotoPage: true }, '')
    const onPop = () => {
      closedByBack = true
      onClose()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!closedByBack) {
        window.history.back()
      }
    }
  }, [onClose])

  const handleReviewAffiliation = async (id, newStatus) => {
    setReviewingId(id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('moto_affiliations').update({
      status:      newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id,
    }).eq('id', id)
    await loadAdminAffiliations()
    await loadApprovedUsers()
    setReviewingId(null)
  }

  // ─── Affiliation request ───────────────────
  const handleRequest = async () => {
    // Vérifier la limite de 3 affiliés max
    const { count } = await supabase
      .from('moto_affiliations')
      .select('id', { count: 'exact', head: true })
      .eq('moto_number', motoNumber)
      .in('status', ['approved', 'pending'])
    if (count >= MAX_AFFILIATIONS) {
      setSubmitStatus('full')
      return
    }

    setRequesting(true)
    const { error } = await supabase.from('moto_affiliations').insert([{
      user_id: session.user.id,
      moto_number: motoNumber,
      note: noteText.trim() || null,
      status: 'pending',
    }])
    setSubmitStatus(error ? 'error' : 'sent')
    if (!error) {
      await loadAffiliation()
      if (isAdmin || isModerator) await loadAdminAffiliations()
    }
    setRequesting(false)
  }

  // ─── Save name + description ───────────────
  const handleSaveProfile = async () => {
    setSaving(true)
    await supabase.from('moto_profiles').upsert([{
      moto_number: motoNumber,
      display_name: editForm.display_name.trim() || null,
      description:  editForm.description.trim()  || null,
      photo_url:    profile?.photo_url || null,
      updated_at:   new Date().toISOString(),
      updated_by:   session?.user.id,
    }], { onConflict: 'moto_number' })
    await loadProfile()
    setEditing(false)
    setSaving(false)
  }

  // ─── Photo : sélection fichier → cropper ──
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Le fichier doit être une image.')
      return
    }
    if (file.size > MAX_RAW_FILE_SIZE) {
      alert('Image trop lourde (max 20 Mo). Le cropper se charge de la compression.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCropperSrc(reader.result)
    reader.onerror = () => alert('Impossible de lire ce fichier.')
    reader.readAsDataURL(file)
    // Reset pour permettre de re-sélectionner le même fichier
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Photo : crop validé → upload → save ──
  const handleCropConfirm = async (blob, ext) => {
    setCropperSrc(null)
    setPhotoUploading(true)
    try {
      const fileName = `moto-${motoNumber}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('moto-profiles')
        .upload(fileName, blob, { upsert: true, contentType: blob.type })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('moto-profiles')
        .getPublicUrl(fileName)

      const photoUrl = `${publicUrl}?t=${Date.now()}`

      await supabase.from('moto_profiles').upsert([{
        moto_number: motoNumber,
        display_name: profile?.display_name || null,
        description:  profile?.description  || null,
        photo_url:    photoUrl,
        updated_at:   new Date().toISOString(),
        updated_by:   session?.user.id,
      }], { onConflict: 'moto_number' })

      await loadProfile()
    } catch (err) {
      alert('Erreur upload photo : ' + err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // ─────────────────────────────────────────
  if (loading) return (
    <div className="moto-page-overlay">
      <div className="moto-page-shell glass">
        <div className="moto-loading">
          <div className="moto-spinner" />
          <p>Chargement du profil moto...</p>
        </div>
      </div>
    </div>
  )

  const displayName = profile?.display_name || `Moto #${motoNumber}`
  // Affiche les affiliés approuvés en priorité, sinon fallback sur les pilotes des courses
  const pilotList = approvedUsers.length > 0
    ? approvedUsers.join(' / ')
    : (stats?.pilots?.join(' / ') || '—')

  return (
    <>
      <div className="moto-page-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="moto-page-shell glass">

          {/* ── Header bar ── */}
          <div className="moto-page-header">
            <button className="moto-back-btn" onClick={onClose}>← Retour aux Motos</button>
            {canEdit && !editing && (
              <button className="btn btn-ghost moto-edit-btn" onClick={() => setEditing(true)}>
                ✏️ Modifier le profil
              </button>
            )}
          </div>

          <div className="moto-page-body">

            {/* ── Hero ── */}
            <div className="moto-hero">

              {/* ── Photo (cliquable si canEdit) ── */}
              <div className="moto-hero-photo">
                {canEdit ? (
                  <>
                    <div
                      className="moto-photo-upload-zone"
                      onClick={() => !photoUploading && fileInputRef.current?.click()}
                      title="Cliquer pour changer la photo"
                    >
                      {profile?.photo_url ? (
                        <img src={profile.photo_url} alt={displayName} className="moto-hero-img" />
                      ) : (
                        <div className="moto-hero-placeholder">
                          <span className="moto-placeholder-icon">🏍️</span>
                        </div>
                      )}

                      {/* Hover overlay */}
                      {!photoUploading && (
                        <div className="moto-photo-upload-overlay">
                          <div className="moto-photo-upload-label">
                            <span className="moto-photo-upload-icon">📷</span>
                            <span>Changer la photo</span>
                          </div>
                        </div>
                      )}

                      {/* Upload spinner */}
                      {photoUploading && (
                        <div className="moto-photo-uploading">
                          <div className="moto-photo-uploading-text">
                            <div className="moto-spinner" style={{ width: 22, height: 22, margin: 0 }} />
                            Envoi...
                          </div>
                        </div>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/heic"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />

                    {/* Petit label sous la photo */}
                    <p style={{
                      textAlign: 'center',
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: '6px',
                      lineHeight: '1.3',
                    }}>
                      Cliquer pour modifier<br />Auto-recadrage 3:2
                    </p>
                  </>
                ) : (
                  profile?.photo_url ? (
                    <img src={profile.photo_url} alt={displayName} className="moto-hero-img" />
                  ) : (
                    <div className="moto-hero-placeholder">
                      <span className="moto-placeholder-icon">🏍️</span>
                    </div>
                  )
                )}
              </div>

              {/* ── Info ── */}
              <div className="moto-hero-info">
                <div className="moto-number-plate">#{motoNumber}</div>

                {editing ? (
                  <input
                    className="moto-name-input"
                    value={editForm.display_name}
                    onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                    placeholder={`Moto #${motoNumber}`}
                    maxLength={60}
                  />
                ) : (
                  <h1 className="moto-display-name">{displayName}</h1>
                )}

                <div className="moto-pilots-line">
                  <span className="moto-pilots-icon">👤</span>
                  <span>{pilotList}</span>
                </div>

                {isAffiliated && !isAdmin && !isModerator && (
                  <div className="moto-aff-badge moto-aff-approved">✅ Compte affilié</div>
                )}
                {isPending && (
                  <div className="moto-aff-badge moto-aff-pending">⏳ Demande en attente de validation</div>
                )}
              </div>
            </div>

            {/* ── Édition nom + description ── */}
            {editing && (
              <div className="moto-edit-desc-block">
                <label className="moto-field-label">Description</label>
                <textarea
                  className="moto-desc-textarea"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Présente ta moto, tes ambitions, ton style..."
                  rows={5}
                  maxLength={1000}
                />
                <div className="moto-edit-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setEditing(false); setEditForm({ display_name: profile?.display_name || '', description: profile?.description || '' }) }}
                  >
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Description (vue) ── */}
            {!editing && profile?.description && (
              <div className="moto-description glass">
                <p>{profile.description}</p>
              </div>
            )}

            {/* ── Stats ── */}
            <div className="moto-stats-grid">
              <div className="moto-stat-card glass">
                <span className="moto-stat-val">{stats?.sessions ?? 0}</span>
                <span className="moto-stat-lbl">Manches</span>
              </div>
              <div className="moto-stat-card glass">
                <span className="moto-stat-val">{stats?.totalLaps ?? 0}</span>
                <span className="moto-stat-lbl">Passages</span>
              </div>
              <div className="moto-stat-card glass">
                <span className="moto-stat-val">{stats?.wins ?? 0}</span>
                <span className="moto-stat-lbl">Victoires</span>
              </div>
              <div className="moto-stat-card glass">
                <span className="moto-stat-val">{stats?.podiums ?? 0}</span>
                <span className="moto-stat-lbl">Podiums</span>
              </div>
              {stats?.bestLap != null && (
                <div className="moto-stat-card glass moto-stat-best">
                  <span className="moto-stat-val moto-stat-time">{formatTime(stats.bestLap)}</span>
                  <span className="moto-stat-lbl">⚡ Meilleur Tour</span>
                </div>
              )}
            </div>

            {/* ── Graphiques de performance ── */}
            {teamHistory.length >= 1 && (
              <MotoCharts teamHistory={teamHistory} />
            )}

            {/* ── Historique des manches ── */}
            {teamHistory.length > 0 && (
              <div className="moto-history">
                <h3 className="moto-history-title">📋 Historique des Manches</h3>
                <div className="moto-history-list">
                  {teamHistory.map((h, i) => (
                    <div key={i} className="moto-history-row glass">
                      <div className="moto-history-session">
                        <span className="moto-history-name">{h.session?.name || '—'}</span>
                        <span className="moto-history-status">
                          {h.session?.status === 'published' ? '🏁 Officiel' : '📋 Terminé'}
                        </span>
                      </div>
                      <div className="moto-history-stats">
                        <span className="moto-history-laps">{h.totalLaps} tours</span>
                        {h.bestLap && <span className="moto-history-best">⚡ {formatTime(h.bestLap)}</span>}
                      </div>
                      <div className="moto-history-pilot">
                        {h.team.pilot_1_name}{h.team.pilot_2_name ? ` & ${h.team.pilot_2_name}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Demande d'affiliation ── */}
            {session && !affiliation && (
              <div className="moto-request-block glass">
                <h3 className="moto-request-title">🔗 Rejoindre ce numéro</h3>
                <p className="moto-request-desc">
                  Tu pilotes le <strong>#{motoNumber}</strong> ? Demande à être associé à ce numéro pour personnaliser son profil.
                  {(isAdmin || isModerator)
                    ? <> En tant qu'admin tu peux <strong>approuver ta propre demande</strong> directement dans le panneau ci-dessous.</>
                    : <> Un admin ou modérateur validera ta demande.</>
                  }
                </p>
                <textarea
                  className="moto-request-note"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Message optionnel (ex : je pilote ce numéro depuis 2023)"
                  rows={3}
                  maxLength={300}
                />
                {submitStatus === 'sent' && (
                  <div className="moto-request-success">
                    ✅ Demande enregistrée !
                    {(isAdmin || isModerator) && ' Approuve-la dans le panneau "Affiliations" ci-dessous.'}
                  </div>
                )}
                {submitStatus === 'error' && (
                  <div className="moto-request-error">❌ Erreur lors de l'envoi. Réessaye ou vérifie la console.</div>
                )}
                {submitStatus === 'full' && (
                  <div className="moto-request-error">⚠️ Ce numéro a déjà atteint la limite de {MAX_AFFILIATIONS} pilotes affiliés.</div>
                )}
                {!submitStatus && (
                  <button className="btn btn-primary" onClick={handleRequest} disabled={requesting}>
                    {requesting ? '⏳ Envoi...' : '📨 Demander l\'affiliation'}
                  </button>
                )}
              </div>
            )}

            {/* ── Invite à se connecter ── */}
            {!session && (
              <div className="moto-login-prompt glass">
                <span>🔑</span>
                <p>Connecte-toi pour demander à être affilié à ce numéro et modifier son profil.</p>
              </div>
            )}

            {/* ── Panneau admin : gestion des affiliations ── */}
            {(isAdmin || isModerator) && (
              <div className="moto-admin-aff glass">
                <h3 className="moto-admin-aff-title">
                  🔗 Affiliations — #{motoNumber}
                  <span className="moto-admin-aff-count">
                    {allAffiliations.filter(a => a.status === 'pending').length > 0 &&
                      <span className="moto-admin-aff-badge">
                        {allAffiliations.filter(a => a.status === 'pending').length} en attente
                      </span>
                    }
                  </span>
                </h3>

                {allAffiliations.length === 0 ? (
                  <p className="moto-admin-aff-empty">Aucune demande d'affiliation pour ce numéro.</p>
                ) : (
                  <div className="moto-admin-aff-list">
                    {allAffiliations.map(aff => (
                      <div key={aff.id} className={`moto-admin-aff-row moto-admin-aff-row--${aff.status}`}>
                        <div className="moto-admin-aff-user">
                          <span className="moto-admin-aff-name">
                            {aff.profiles?.display_name || '—'}
                          </span>
                          <span className="moto-admin-aff-email">
                            {aff.profiles?.email || aff.user_id?.slice(0, 8) + '…'}
                          </span>
                          {aff.note && (
                            <span className="moto-admin-aff-note">💬 {aff.note}</span>
                          )}
                          <span className="moto-admin-aff-date">
                            {new Date(aff.requested_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>

                        <div className="moto-admin-aff-status">
                          {aff.status === 'pending'  && <span className="moto-aff-badge moto-aff-pending">⏳ En attente</span>}
                          {aff.status === 'approved' && <span className="moto-aff-badge moto-aff-approved">✅ Approuvé</span>}
                          {aff.status === 'rejected' && <span className="moto-aff-badge moto-aff-rejected">❌ Refusé</span>}
                        </div>

                        <div className="moto-admin-aff-actions">
                          {aff.status === 'pending' && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleReviewAffiliation(aff.id, 'approved')}
                                disabled={reviewingId === aff.id}
                              >
                                ✅ Approuver
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleReviewAffiliation(aff.id, 'rejected')}
                                disabled={reviewingId === aff.id}
                              >
                                ❌ Refuser
                              </button>
                            </>
                          )}
                          {aff.status === 'approved' && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleReviewAffiliation(aff.id, 'rejected')}
                              disabled={reviewingId === aff.id}
                            >
                              🔒 Révoquer
                            </button>
                          )}
                          {aff.status === 'rejected' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleReviewAffiliation(aff.id, 'approved')}
                              disabled={reviewingId === aff.id}
                            >
                              ↩️ Réapprouver
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Cropper (par-dessus tout) ── */}
      {cropperSrc && (
        <MotoCropper
          imageSrc={cropperSrc}
          onCancel={() => setCropperSrc(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  )
}
