/**
 * RiderPage — Fiche présentation d'un rider (modale plein écran)
 *
 * Affiche pour chaque rider :
 *  - Une hero photo (landscape) en bandeau
 *  - L'avatar circulaire qui mord sur la hero
 *  - Nom + rôle (tagline)
 *  - Onglets : 🪪 Profil / 💡 Fun Fact / 🏍️ Motos
 *
 * Admin (`canEdit`) :
 *  - Edit inline du nom / role / bio / fun_fact
 *  - Upload avatar (image_url) et hero (hero_photo_url) via AvatarCropper
 *    (carré 512px ; le hero est ensuite recadré par CSS object-fit cover)
 *
 * Comme MotoPage : Portal sur document.body + body scroll lock +
 * history.pushState pour bouton retour mobile.
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import AvatarCropper from './AvatarCropper'
import './RiderPage.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024

// Profils de crop par type de média ; on choisit aspect + dimensions
// pour chaque image pour qu'elle prenne juste la place qu'il lui faut.
const CROP_PROFILES = {
  image_url: {
    aspect: 1,
    outputWidth: 512,
    outputHeight: 512,
    cropShape: 'round',
    title: '✂️ Recadrer l\'avatar',
    hint: 'Centre le visage du rider. L\'avatar s\'affiche en rond, ~80 Ko de sortie.',
    backgroundFill: '#1a1a2e',
  },
  nickname_url: {
    aspect: 3,
    outputWidth: 720,
    outputHeight: 240,
    cropShape: 'rect',
    title: '✂️ Recadrer la photo du pseudo',
    hint: 'Format bandeau (3:1) pour un nom style graffiti. Le fond transparent est préservé.',
    backgroundFill: null, // PNG/WebP transparent → on garde l'alpha
  },
  hero_photo_url: {
    aspect: 16 / 9,
    outputWidth: 1600,
    outputHeight: 900,
    cropShape: 'rect',
    title: '✂️ Recadrer la bannière',
    hint: 'Format 16:9 pour le bandeau d\'en-tête de la fiche. Cadre les éléments importants au centre.',
    backgroundFill: '#0a0a0a',
  },
}

export default function RiderPage({ rider, canEdit, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('profil')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [cropperSrc, setCropperSrc] = useState(null)
  const [cropperTarget, setCropperTarget] = useState(null) // 'image_url' | 'nickname_url' | 'hero_photo_url'
  const [saving, setSaving] = useState(false)
  const avatarInputRef = useRef(null)
  const nicknameInputRef = useRef(null)
  const heroInputRef = useRef(null)

  // ── Verrouillage scroll + back button ──
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (window.__mydRiderBackTimer) {
      clearTimeout(window.__mydRiderBackTimer)
      window.__mydRiderBackTimer = null
    }
    let closedByBack = false
    if (!window.history.state?.mydRiderPage) {
      window.history.pushState({ mydRiderPage: true }, '')
    }
    const onPop = () => { closedByBack = true; onClose() }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (closedByBack) return
      window.__mydRiderBackTimer = setTimeout(() => {
        window.__mydRiderBackTimer = null
        if (window.history.state?.mydRiderPage) window.history.back()
      }, 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getValue = (field) => draft[field] !== undefined ? draft[field] : (rider?.[field] ?? '')

  const startEdit = () => {
    setDraft({})
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft({})
    setEditing(false)
  }

  const handleSave = async () => {
    if (!rider?.id) return
    setSaving(true)
    try {
      const patch = {}
      ;['name', 'role', 'bio', 'fun_fact', 'image_url', 'hero_photo_url'].forEach(k => {
        if (draft[k] !== undefined) patch[k] = draft[k]
      })
      if (Object.keys(patch).length === 0) { setEditing(false); return }
      const { error } = await supabase.from('team').update(patch).eq('id', rider.id)
      if (error) throw error
      onSaved && onSaved({ ...rider, ...patch })
      setDraft({})
      setEditing(false)
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const pickFile = (target, file) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      alert(`Image trop volumineuse. Max : ${MAX_FILE_SIZE / 1024 / 1024} Mo`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setCropperSrc(e.target.result)
      setCropperTarget(target)
    }
    reader.readAsDataURL(file)
  }

  const handleCropConfirm = async (blob) => {
    if (!cropperTarget || !rider?.id) {
      setCropperSrc(null); setCropperTarget(null); return
    }
    setSaving(true)
    try {
      const ext = blob.type.includes('webp') ? 'webp' : 'jpg'
      const ts = Date.now()
      const path = `${rider.id}/${cropperTarget}-${ts}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('team-assets')
        .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: blob.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('team-assets').getPublicUrl(path)
      const finalUrl = `${publicUrl}?v=${ts}`
      const { error: dbErr } = await supabase
        .from('team').update({ [cropperTarget]: finalUrl }).eq('id', rider.id)
      if (dbErr) throw dbErr
      onSaved && onSaved({ ...rider, [cropperTarget]: finalUrl })
      setDraft(d => ({ ...d, [cropperTarget]: finalUrl }))
    } catch (err) {
      alert("Erreur d'upload : " + err.message)
    } finally {
      setCropperSrc(null)
      setCropperTarget(null)
      setSaving(false)
    }
  }

  if (!rider) return null

  const avatarUrl  = getValue('image_url')
  const heroUrl    = getValue('hero_photo_url')
  const name       = getValue('name')
  const role       = getValue('role')
  const bio        = getValue('bio')
  const funFact    = getValue('fun_fact')

  return createPortal(
    <div className="rider-page-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rider-page-shell glass">

        {/* ── Header sticky ── */}
        <div className="rider-page-topbar">
          <button className="rider-page-close" onClick={onClose} aria-label="Fermer">✕</button>
          {canEdit && !editing && (
            <button className="btn btn-ghost rider-page-edit-btn" onClick={startEdit}>
              ✏️ Modifier
            </button>
          )}
          {canEdit && editing && (
            <div className="rider-page-edit-actions">
              <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '…' : '💾 Sauvegarder'}
              </button>
            </div>
          )}
        </div>

        {/* ── Hero photo ── */}
        <div
          className={`rider-page-hero ${editing ? 'rider-page-hero-editable' : ''}`}
          onClick={() => editing && heroInputRef.current?.click()}
        >
          {heroUrl ? (
            <img src={heroUrl} alt={name} className="rider-page-hero-img" />
          ) : (
            <div className="rider-page-hero-placeholder">
              {editing ? '📷 Cliquer pour ajouter une photo' : ''}
            </div>
          )}
          {editing && (
            <div className="rider-page-hero-overlay">
              <span>📷 Changer la photo</span>
            </div>
          )}
          <div className="rider-page-hero-fade" />
          <input
            ref={heroInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              pickFile('hero_photo_url', e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        {/* ── Identity block (avatar overlaps hero) ── */}
        <div className="rider-page-identity">
          <div
            className={`rider-page-avatar-wrap ${editing ? 'rider-page-avatar-editable' : ''}`}
            onClick={() => editing && avatarInputRef.current?.click()}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="rider-page-avatar" />
            ) : (
              <div className="rider-page-avatar-placeholder">👤</div>
            )}
            {editing && <div className="rider-page-avatar-edit-badge">📷</div>}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                pickFile('image_url', e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          <div className="rider-page-name-block">
            {editing ? (
              <>
                <input
                  className="rider-page-name-input"
                  value={name}
                  placeholder="Nom"
                  onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                />
                <input
                  className="rider-page-role-input"
                  value={role}
                  placeholder="Rôle (ex: Mécanicien chef)"
                  onChange={(e) => setDraft(d => ({ ...d, role: e.target.value }))}
                />
                {/* Mini-aperçu du nickname uploadé en édition */}
                <div className="rider-page-nickname-edit">
                  {getValue('nickname_url') ? (
                    <img
                      src={getValue('nickname_url')}
                      alt="Pseudo graphique"
                      className="rider-page-nickname-preview"
                    />
                  ) : (
                    <span className="rider-page-nickname-empty">
                      Pas de photo de pseudo
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost rider-page-nickname-upload"
                    onClick={() => nicknameInputRef.current?.click()}
                  >
                    🖼️ {getValue('nickname_url') ? 'Changer' : 'Ajouter'} la photo du pseudo
                  </button>
                  <input
                    ref={nicknameInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      pickFile('nickname_url', e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Si une image de pseudo est uploadée, on l'affiche en
                    grand à la place du h1 — c'est plus stylé (style graff). */}
                {getValue('nickname_url') ? (
                  <img
                    src={getValue('nickname_url')}
                    alt={name}
                    className="rider-page-nickname-display"
                  />
                ) : (
                  <h1 className="rider-page-name">{name || 'Rider'}</h1>
                )}
                {role && <p className="rider-page-role">{role}</p>}
              </>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="rider-page-tabs">
          <button
            className={`rider-page-tab ${activeTab === 'profil' ? 'active' : ''}`}
            onClick={() => setActiveTab('profil')}
          >
            🪪 Profil
          </button>
          <button
            className={`rider-page-tab ${activeTab === 'funfact' ? 'active' : ''}`}
            onClick={() => setActiveTab('funfact')}
          >
            💡 Fun Fact
          </button>
        </div>

        {/* ── Tab content ── */}
        <div className="rider-page-content">
          {activeTab === 'profil' && (
            <div className="rider-page-card">
              <h3 className="rider-page-card-title">À propos</h3>
              {editing ? (
                <textarea
                  className="rider-page-bio-textarea"
                  value={bio}
                  rows={8}
                  placeholder="Bio du rider, son rôle, ses talents…"
                  onChange={(e) => setDraft(d => ({ ...d, bio: e.target.value }))}
                />
              ) : bio ? (
                <p className="rider-page-bio">{bio}</p>
              ) : (
                <p className="rider-page-empty">Aucune bio renseignée pour ce rider.</p>
              )}
            </div>
          )}

          {activeTab === 'funfact' && (
            <div className="rider-page-card rider-page-card-funfact">
              <h3 className="rider-page-card-title">💡 Le saviez-vous ?</h3>
              {editing ? (
                <textarea
                  className="rider-page-bio-textarea"
                  value={funFact}
                  rows={4}
                  placeholder="Anecdote courte qui claque (1-2 phrases max)"
                  onChange={(e) => setDraft(d => ({ ...d, fun_fact: e.target.value }))}
                />
              ) : funFact ? (
                <p className="rider-page-funfact">"{funFact}"</p>
              ) : (
                <p className="rider-page-empty">Pas d'anecdote… encore.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Cropper modal (dimensions selon la cible) ── */}
      {cropperSrc && cropperTarget && (
        <AvatarCropper
          imageSrc={cropperSrc}
          onCancel={() => { setCropperSrc(null); setCropperTarget(null) }}
          onConfirm={handleCropConfirm}
          {...(CROP_PROFILES[cropperTarget] || {})}
        />
      )}
    </div>,
    document.body
  )
}
