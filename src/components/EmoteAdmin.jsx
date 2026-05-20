/**
 * EmoteAdmin — Gestion des emotes & sons premium (admin)
 *
 * Fonctionnalités :
 *  - Lister tous les shop_items
 *  - Modifier nom, description, prix, visibilité de chaque item
 *  - Uploader un visuel (image / GIF / MP4) → stocké dans bucket emote-assets
 *    - MP4 : on utilise son son intégré (sound_url effacé automatiquement)
 *    - GIF/PNG/WebP : un champ son séparé reste disponible
 *  - Uploader un fichier son MP3/WAV séparé
 *  - Tout est uploadé dans Supabase Storage (bucket 'emote-assets')
 */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import './EmoteAdmin.css'

const MAX_MEDIA_SIZE = 20 * 1024 * 1024  // 20 MB
const MAX_SOUND_SIZE = 5 * 1024 * 1024   // 5 MB

const MEDIA_ACCEPT = 'image/gif,image/png,image/webp,image/jpeg,video/mp4'
const SOUND_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/ogg'

const inferMediaType = (fileName) => {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'mp4') return 'mp4'
  if (['gif', 'png', 'webp', 'jpg', 'jpeg'].includes(ext)) return 'gif'
  return 'gif'
}

export default function EmoteAdmin({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [drafts, setDrafts] = useState({}) // { itemId: { name, description, price_cents, is_visible } }
  const mediaInputsRef = useRef({})
  const soundInputsRef = useRef({})

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) {
      alert('Erreur de chargement : ' + error.message)
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setDraft = (id, patch) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const getValue = (item, field) => {
    const d = drafts[item.id]
    if (d && Object.prototype.hasOwnProperty.call(d, field)) return d[field]
    return item[field]
  }

  const hasUnsavedChanges = (item) => {
    const d = drafts[item.id]
    if (!d) return false
    return Object.keys(d).some(k => d[k] !== item[k])
  }

  const handleUpload = async (item, file, kind) => {
    if (!file) return
    const maxSize = kind === 'media' ? MAX_MEDIA_SIZE : MAX_SOUND_SIZE
    if (file.size > maxSize) {
      alert(`Fichier trop volumineux. Max : ${maxSize / (1024 * 1024)} Mo`)
      return
    }

    setSavingId(item.id)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const ts = Date.now()
      const path = `${item.slug}/${kind}-${ts}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('emote-assets')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('emote-assets')
        .getPublicUrl(path)

      // Cache-bust : on append un ?v=ts pour forcer le rafraîchissement client
      const finalUrl = `${publicUrl}?v=${ts}`

      let patch
      if (kind === 'media') {
        const mediaType = inferMediaType(file.name)
        patch = {
          media_url: finalUrl,
          media_type: mediaType,
          animation_url: finalUrl, // on garde l'ancien champ synchro pour rétro-compat
          // MP4 : on efface le son séparé car la vidéo a son propre audio
          ...(mediaType === 'mp4' ? { sound_url: null } : {}),
        }
      } else {
        patch = { sound_url: finalUrl }
      }

      const { error: dbErr } = await supabase
        .from('shop_items')
        .update(patch)
        .eq('id', item.id)
      if (dbErr) throw dbErr

      await load()
    } catch (err) {
      alert(`Échec de l'upload : ${err.message}`)
    } finally {
      setSavingId(null)
    }
  }

  const handleClearSound = async (item) => {
    if (!confirm(`Supprimer le son personnalisé de "${item.name}" ?`)) return
    setSavingId(item.id)
    try {
      const { error } = await supabase
        .from('shop_items')
        .update({ sound_url: null })
        .eq('id', item.id)
      if (error) throw error
      await load()
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setSavingId(null)
    }
  }

  const handleSave = async (item) => {
    const d = drafts[item.id]
    if (!d) return
    setSavingId(item.id)
    try {
      const patch = {
        name: d.name ?? item.name,
        description: d.description ?? item.description,
        price_cents: d.price_cents !== undefined ? parseInt(d.price_cents, 10) : item.price_cents,
        is_visible: d.is_visible !== undefined ? d.is_visible : item.is_visible,
      }
      if (Number.isNaN(patch.price_cents) || patch.price_cents < 0) {
        alert('Prix invalide')
        return
      }
      const { error } = await supabase
        .from('shop_items')
        .update(patch)
        .eq('id', item.id)
      if (error) throw error
      setDrafts(prev => {
        const c = { ...prev }
        delete c[item.id]
        return c
      })
      await load()
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setSavingId(null)
    }
  }

  const previewSound = (url) => {
    if (!url) return
    try {
      const a = new Audio(url)
      a.volume = 0.7
      a.play().catch(() => {})
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="emote-admin-loading">
        <div className="emote-admin-spinner" />
        <p>Chargement des emotes...</p>
      </div>
    )
  }

  return (
    <div className="emote-admin">
      <div className="emote-admin-intro">
        <p>
          Modifie le nom, le visuel et le son de chaque emote. Les changements sont
          appliqués <strong>instantanément à tout le monde</strong> sur le live.
        </p>
        <ul>
          <li><strong>MP4</strong> : la vidéo joue son propre son (le champ son MP3 est désactivé)</li>
          <li><strong>GIF / PNG / WebP</strong> : tu peux ajouter un son MP3 séparé</li>
          <li>Si aucun son n'est uploadé, un son synthétisé par défaut est utilisé</li>
        </ul>
      </div>

      <div className="emote-admin-list">
        {items.map(item => {
          const isPack = item.type === 'pack'
          const mediaUrl = item.media_url || item.animation_url
          const isVideo = item.media_type === 'mp4' || /\.mp4($|\?)/i.test(mediaUrl || '')
          const saving = savingId === item.id

          return (
            <div key={item.id} className={`emote-admin-row ${isPack ? 'is-pack' : ''} ${!item.is_visible ? 'is-hidden' : ''}`}>
              {/* Preview */}
              <div className="emote-admin-preview">
                {isPack ? (
                  <div className="emote-admin-preview-pack">🎁</div>
                ) : isVideo && mediaUrl ? (
                  <video src={mediaUrl} className="emote-admin-preview-media" muted loop autoPlay playsInline />
                ) : mediaUrl ? (
                  <img src={mediaUrl} alt={item.name} className="emote-admin-preview-media" />
                ) : (
                  <div className="emote-admin-preview-emoji">{item.emoji || '❓'}</div>
                )}
                <span className="emote-admin-preview-type">
                  {isPack ? 'PACK' : isVideo ? 'MP4' : (mediaUrl ? 'GIF' : 'EMOJI')}
                </span>
              </div>

              {/* Infos */}
              <div className="emote-admin-fields">
                <label className="emote-admin-field">
                  <span className="emote-admin-label">Nom</span>
                  <input
                    type="text"
                    value={getValue(item, 'name') ?? ''}
                    onChange={(e) => setDraft(item.id, { name: e.target.value })}
                    disabled={saving}
                  />
                </label>

                <label className="emote-admin-field">
                  <span className="emote-admin-label">Description</span>
                  <textarea
                    rows={2}
                    value={getValue(item, 'description') ?? ''}
                    onChange={(e) => setDraft(item.id, { description: e.target.value })}
                    disabled={saving}
                  />
                </label>

                <div className="emote-admin-field-row">
                  <label className="emote-admin-field" style={{ flex: '0 0 130px' }}>
                    <span className="emote-admin-label">Prix (centimes)</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={getValue(item, 'price_cents') ?? 0}
                      onChange={(e) => setDraft(item.id, { price_cents: e.target.value })}
                      disabled={saving}
                    />
                  </label>

                  <label className="emote-admin-toggle">
                    <input
                      type="checkbox"
                      checked={getValue(item, 'is_visible') !== false}
                      onChange={(e) => setDraft(item.id, { is_visible: e.target.checked })}
                      disabled={saving}
                    />
                    <span>Visible</span>
                  </label>

                  {hasUnsavedChanges(item) && (
                    <button
                      className="btn btn-primary emote-admin-save"
                      onClick={() => handleSave(item)}
                      disabled={saving}
                    >
                      {saving ? '…' : '💾 Enregistrer'}
                    </button>
                  )}
                </div>

                {!isPack && (
                  <div className="emote-admin-uploads">
                    {/* MEDIA upload */}
                    <div className="emote-admin-upload">
                      <span className="emote-admin-label">Visuel (GIF / PNG / WebP / MP4 — max 20 Mo)</span>
                      <div className="emote-admin-upload-row">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => mediaInputsRef.current[item.id]?.click()}
                          disabled={saving}
                        >
                          📤 Remplacer le visuel
                        </button>
                        <input
                          ref={(el) => { mediaInputsRef.current[item.id] = el }}
                          type="file"
                          accept={MEDIA_ACCEPT}
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            handleUpload(item, f, 'media')
                            e.target.value = ''
                          }}
                        />
                        {mediaUrl && (
                          <a href={mediaUrl} target="_blank" rel="noopener" className="emote-admin-link">
                            Voir
                          </a>
                        )}
                      </div>
                    </div>

                    {/* SOUND upload — désactivé si MP4 */}
                    <div className="emote-admin-upload">
                      <span className="emote-admin-label">
                        Son MP3 / WAV (max 5 Mo)
                        {isVideo && <em style={{ marginLeft: 8, color: 'var(--text-muted)' }}>— désactivé (le MP4 joue son propre son)</em>}
                      </span>
                      <div className="emote-admin-upload-row">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => soundInputsRef.current[item.id]?.click()}
                          disabled={saving || isVideo}
                        >
                          🔊 {item.sound_url ? 'Remplacer le son' : 'Ajouter un son'}
                        </button>
                        <input
                          ref={(el) => { soundInputsRef.current[item.id] = el }}
                          type="file"
                          accept={SOUND_ACCEPT}
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            handleUpload(item, f, 'sound')
                            e.target.value = ''
                          }}
                        />
                        {item.sound_url && !isVideo && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost emote-admin-listen-btn"
                              onClick={() => previewSound(item.sound_url)}
                              disabled={saving}
                              title="Écouter"
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost emote-admin-listen-btn"
                              onClick={() => handleClearSound(item)}
                              disabled={saving}
                              title="Supprimer le son"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {items.length === 0 && (
          <div className="emote-admin-empty">
            <p>Aucune emote dans la base. Lance la migration <code>database_v11_premium.sql</code> pour en créer.</p>
          </div>
        )}
      </div>

      {onClose && (
        <div className="emote-admin-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        </div>
      )}
    </div>
  )
}
