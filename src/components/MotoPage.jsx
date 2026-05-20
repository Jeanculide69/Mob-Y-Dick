/**
 * MotoPage — Profil par numéro de moto
 *
 * SQL à exécuter dans Supabase (une seule fois) :
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
 * create policy "mp_read" on moto_profiles for select using (true);
 * create policy "ma_read_own" on moto_affiliations for select using (auth.uid() = user_id);
 * create policy "ma_insert" on moto_affiliations for insert with check (auth.uid() = user_id);
 * create policy "mp_write_aff" on moto_profiles for all using (
 *   auth.uid() in (
 *     select user_id from moto_affiliations
 *     where moto_number = moto_profiles.moto_number and status = 'approved'
 *   )
 * );
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import './MotoPage.css'

const formatTime = (ms) => {
  if (!ms && ms !== 0) return '--:--.---'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const ms3 = ms % 1000
  return `${m}:${s.toString().padStart(2, '0')}.${ms3.toString().padStart(3, '0')}`
}

export default function MotoPage({ motoNumber, session, isAdmin, isModerator, onClose }) {
  // ── Profile data ──
  const [profile, setProfile]           = useState(null)  // row from moto_profiles
  const [affiliation, setAffiliation]   = useState(null)  // row from moto_affiliations (own)
  const [stats, setStats]               = useState(null)  // computed stats
  const [teamHistory, setTeamHistory]   = useState([])    // [{ session, team, laps, bestLap }]

  // ── UI states ──
  const [loading, setLoading]           = useState(true)
  const [editing, setEditing]           = useState(false)
  const [requesting, setRequesting]     = useState(false)
  const [noteText, setNoteText]         = useState('')
  const [submitStatus, setSubmitStatus] = useState(null)  // 'sent' | 'error'

  // ── Edit form ──
  const [editForm, setEditForm]         = useState({ display_name: '', description: '' })
  const [editPhoto, setEditPhoto]       = useState(null)  // File
  const [editPhotoPreview, setEditPhotoPreview] = useState(null)
  const [saving, setSaving]             = useState(false)
  const fileRef                         = useRef(null)

  const isAffiliated = affiliation?.status === 'approved'
  const isPending    = affiliation?.status === 'pending'
  const canEdit      = isAffiliated || isAdmin || isModerator

  useEffect(() => { loadAll() }, [motoNumber, session])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([
      loadProfile(),
      loadStats(),
      session ? loadAffiliation() : Promise.resolve(),
    ])
    setLoading(false)
  }

  const loadProfile = async () => {
    const { data, error } = await supabase
      .from('moto_profiles')
      .select('*')
      .eq('moto_number', motoNumber)
      .maybeSingle()
    if (!error && data) {
      setProfile(data)
      setEditForm({ display_name: data.display_name || '', description: data.description || '' })
    }
  }

  const loadStats = async () => {
    // 1. All race_teams with this moto number
    const { data: teamsData, error: teamsErr } = await supabase
      .from('race_teams')
      .select('*, race_sessions(id, name, status, created_at)')
      .eq('moto_number', motoNumber)

    if (teamsErr || !teamsData?.length) { setStats({ sessions: 0, totalLaps: 0 }); return }

    const teamIds = teamsData.map(t => t.id)

    // 2. All laps for those teams
    const { data: lapsData } = await supabase
      .from('race_laps')
      .select('*')
      .in('team_id', teamIds)

    const laps = lapsData || []

    // 3. Compute per-session history
    const history = teamsData.map(team => {
      const sessLaps = laps
        .filter(l => l.team_id === team.id)
        .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      const splits = sessLaps.map((l, i) => i === 0 ? l.lap_time_ms : l.lap_time_ms - sessLaps[i - 1].lap_time_ms)
      return {
        session: team.race_sessions,
        team,
        totalLaps: sessLaps.length,
        bestLap: splits.length ? Math.min(...splits) : null,
      }
    }).filter(h => h.session) // only if session info loaded

    // 4. Global stats
    const allSplits = []
    history.forEach(h => {
      const sessLaps = laps.filter(l => l.team_id === h.team.id).sort((a, b) => a.lap_time_ms - b.lap_time_ms)
      sessLaps.forEach((l, i) => allSplits.push(i === 0 ? l.lap_time_ms : l.lap_time_ms - sessLaps[i - 1].lap_time_ms))
    })

    // Podiums: check rank per session
    let wins = 0, podiums = 0
    for (const h of history) {
      const { data: allTeams } = await supabase.from('race_teams').select('id').eq('session_id', h.session?.id).single().catch(() => ({ data: null }))
      // simplified — count position from total laps
      wins   += h.totalLaps > 0 && history.filter(x => x.session?.id === h.session?.id && x.totalLaps > h.totalLaps).length === 0 ? 1 : 0
      podiums += h.totalLaps > 0 && history.filter(x => x.session?.id === h.session?.id && x.totalLaps > h.totalLaps).length < 3 ? 1 : 0
    }

    setTeamHistory(history.sort((a, b) => new Date(b.session?.created_at) - new Date(a.session?.created_at)))
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

  // ── Request affiliation ──
  const handleRequest = async () => {
    if (!session) return
    setRequesting(true)
    const { error } = await supabase.from('moto_affiliations').insert([{
      user_id: session.user.id,
      moto_number: motoNumber,
      note: noteText.trim() || null,
      status: 'pending',
    }])
    if (error) {
      setSubmitStatus('error')
    } else {
      setSubmitStatus('sent')
      await loadAffiliation()
    }
    setRequesting(false)
  }

  // ── Save profile ──
  const handleSaveProfile = async () => {
    setSaving(true)
    let photo_url = profile?.photo_url || null

    if (editPhoto) {
      const ext  = editPhoto.name.split('.').pop()
      const name = `moto-${motoNumber}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('moto-profiles')
        .upload(name, editPhoto, { upsert: true })
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('moto-profiles').getPublicUrl(name)
        photo_url = publicUrl
      }
    }

    const payload = {
      moto_number: motoNumber,
      display_name: editForm.display_name.trim() || null,
      description:  editForm.description.trim()  || null,
      photo_url,
      updated_at: new Date().toISOString(),
      updated_by: session?.user.id,
    }

    await supabase.from('moto_profiles').upsert([payload], { onConflict: 'moto_number' })
    await loadProfile()
    setEditing(false)
    setEditPhoto(null)
    setEditPhotoPreview(null)
    setSaving(false)
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Photo trop lourde (max 5 Mo)'); return }
    setEditPhoto(file)
    setEditPhotoPreview(URL.createObjectURL(file))
  }

  // ── UI ──
  if (loading) return (
    <div className="moto-page-overlay">
      <div className="moto-page-shell">
        <div className="moto-loading">
          <div className="moto-spinner" />
          <p>Chargement du profil moto...</p>
        </div>
      </div>
    </div>
  )

  const displayName = profile?.display_name || `Moto #${motoNumber}`
  const pilotList   = stats?.pilots?.join(' / ') || '—'

  return (
    <div className="moto-page-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="moto-page-shell glass">

        {/* ── Header ── */}
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
            <div className="moto-hero-photo">
              {(editPhotoPreview || profile?.photo_url) ? (
                <img
                  src={editPhotoPreview || profile.photo_url}
                  alt={`Moto #${motoNumber}`}
                  className="moto-hero-img"
                />
              ) : (
                <div className="moto-hero-placeholder">
                  <span className="moto-placeholder-icon">🏍️</span>
                </div>
              )}
              {editing && (
                <>
                  <button className="moto-photo-change-btn" onClick={() => fileRef.current?.click()}>
                    📷 Changer la photo
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                </>
              )}
            </div>

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

              {/* Affiliation badge */}
              {isAffiliated && !isAdmin && !isModerator && (
                <div className="moto-aff-badge moto-aff-approved">✅ Compte affilié</div>
              )}
              {isPending && (
                <div className="moto-aff-badge moto-aff-pending">⏳ Demande en attente de validation</div>
              )}
            </div>
          </div>

          {/* ── Edit description ── */}
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
                <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditPhoto(null); setEditPhotoPreview(null) }}>
                  Annuler
                </button>
                <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                  {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {/* ── Description (view mode) ── */}
          {!editing && profile?.description && (
            <div className="moto-description glass">
              <p>{profile.description}</p>
            </div>
          )}

          {/* ── Stats grid ── */}
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
            {stats?.bestLap && (
              <div className="moto-stat-card glass moto-stat-best">
                <span className="moto-stat-val moto-stat-time">{formatTime(stats.bestLap)}</span>
                <span className="moto-stat-lbl">⚡ Meilleur Tour</span>
              </div>
            )}
          </div>

          {/* ── Session history ── */}
          {teamHistory.length > 0 && (
            <div className="moto-history">
              <h3 className="moto-history-title">📋 Historique des Manches</h3>
              <div className="moto-history-list">
                {teamHistory.map((h, i) => (
                  <div key={i} className="moto-history-row glass">
                    <div className="moto-history-session">
                      <span className="moto-history-name">{h.session?.name || '—'}</span>
                      <span className="moto-history-status">{h.session?.status === 'published' ? '🏁 Officiel' : '📋 Terminé'}</span>
                    </div>
                    <div className="moto-history-stats">
                      <span className="moto-history-laps">{h.totalLaps} tours</span>
                      {h.bestLap && <span className="moto-history-best">⚡ {formatTime(h.bestLap)}</span>}
                    </div>
                    <div className="moto-history-pilot">{h.team.pilot_1_name}{h.team.pilot_2_name ? ` & ${h.team.pilot_2_name}` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Affiliation request ── */}
          {session && !affiliation && !isAdmin && !isModerator && (
            <div className="moto-request-block glass">
              <h3 className="moto-request-title">🔗 Rejoindre ce numéro</h3>
              <p className="moto-request-desc">
                Tu pilotes le <strong>#{motoNumber}</strong> ? Demande à être associé à ce numéro pour pouvoir personnaliser son profil. Un admin ou modérateur validera ta demande.
              </p>
              <textarea
                className="moto-request-note"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Message optionnel pour l'admin (ex : je suis bien le pilote de ce numéro)"
                rows={3}
                maxLength={300}
              />
              {submitStatus === 'sent' && (
                <div className="moto-request-success">✅ Demande envoyée ! L'équipe va valider ça rapidement.</div>
              )}
              {submitStatus === 'error' && (
                <div className="moto-request-error">❌ Erreur lors de l'envoi. Réessaye ou contacte un admin.</div>
              )}
              {submitStatus === null && (
                <button
                  className="btn btn-primary"
                  onClick={handleRequest}
                  disabled={requesting}
                >
                  {requesting ? '⏳ Envoi...' : '📨 Demander l\'affiliation'}
                </button>
              )}
            </div>
          )}

          {/* Prompt to log in if not connected */}
          {!session && (
            <div className="moto-login-prompt glass">
              <span>🔑</span>
              <p>Connecte-toi pour demander à être affilié à ce numéro et modifier son profil.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
