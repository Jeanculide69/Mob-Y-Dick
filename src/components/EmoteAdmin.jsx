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
import VideoTrimmer from './VideoTrimmer'
import './EmoteAdmin.css'

const MAX_MEDIA_SIZE = 20 * 1024 * 1024  // 20 MB
const MAX_SOUND_SIZE = 5 * 1024 * 1024   // 5 MB

const MEDIA_ACCEPT = 'image/gif,image/png,image/webp,image/jpeg,video/mp4,video/webm,video/quicktime'
const SOUND_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/ogg'

const inferMediaType = (fileName) => {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'mp4' // sémantique : vidéo avec son intégré
  if (['gif', 'png', 'webp', 'jpg', 'jpeg'].includes(ext)) return 'gif'
  return 'gif'
}

const isVideoFile = (file) => {
  if (!file) return false
  if (file.type && file.type.startsWith('video/')) return true
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return ['mp4', 'webm', 'mov', 'm4v'].includes(ext)
}

export default function EmoteAdmin({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [drafts, setDrafts] = useState({}) // { itemId: { name, description, price_cents, is_visible } }
  // Trimmer vidéo : on garde le contexte de l'upload pendant la modale
  const [trimmer, setTrimmer] = useState(null) // { item, file } | null
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

  const handleUpload = async (item, file, kind, opts = {}) => {
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
      if (upErr) {
        const msg = (upErr.message || '').toLowerCase()
        if (msg.includes('bucket not found') || msg.includes('bucket') && msg.includes('not')) {
          throw new Error(
            "Le bucket 'emote-assets' n'existe pas encore sur Supabase Storage.\n\n" +
            "▶ Va dans le Dashboard Supabase → SQL Editor, puis exécute le contenu\n" +
            "du fichier database_v15_emote_management.sql (à la racine du repo).\n\n" +
            "Le fichier crée le bucket et configure les permissions admin."
          )
        }
        if (msg.includes('row-level security') || msg.includes('rls') || msg.includes('policy')) {
          throw new Error(
            "Upload refusé par les policies RLS du bucket.\n\n" +
            "Vérifie que ton compte a bien le rôle 'admin' ou 'organisateur' dans\n" +
            "la table profiles, puis ré-exécute database_v15_emote_management.sql."
          )
        }
        throw upErr
      }

      const { data: { publicUrl } } = supabase.storage
        .from('emote-assets')
        .getPublicUrl(path)

      // Cache-bust : on append un ?v=ts pour forcer le rafraîchissement client
      const finalUrl = `${publicUrl}?v=${ts}`

      let patch
      if (kind === 'media') {
        const mediaType = inferMediaType(file.name)
        // Si la vidéo contient son propre son (hasAudio !== false), on efface
        // le sound_url séparé. Sinon on garde l'éventuel MP3 existant : la
        // vidéo silencieuse pourra être accompagnée d'un son uploadé à part.
        const videoHasAudio = mediaType === 'mp4' && opts.hasAudio !== false
        patch = {
          media_url: finalUrl,
          media_type: mediaType,
          animation_url: finalUrl, // on garde l'ancien champ synchro pour rétro-compat
          ...(videoHasAudio ? { sound_url: null } : {}),
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

  // Repositionner à une position arbitraire (ex : taper "5" pour passer en #5).
  // Contrairement à handleMove qui swap juste deux voisins, ici on splice et
  // on réécrit toute la séquence de sort_order de 1 à N — c'est le seul moyen
  // fiable de garantir la position visuelle voulue (les sort_order pouvaient
  // avoir des trous accumulés au fil des swaps).
  const handleSetPosition = async (item, newPosRaw) => {
    const newPos = parseInt(newPosRaw, 10)
    const oldIdx = items.findIndex(i => i.id === item.id)
    if (oldIdx === -1) return
    // Hors plage ou identique → no-op (le `key` du input forcera la remise
    // à la bonne valeur visuelle au prochain render).
    if (!Number.isInteger(newPos) || newPos < 1 || newPos > items.length) return
    const newIdx = newPos - 1
    if (newIdx === oldIdx) return

    // Optimistic UI : on réordonne localement avant le round-trip
    const reordered = [...items]
    reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, item)
    setItems(reordered)

    setSavingId(item.id)
    try {
      // Réassigne sort_order = position+1 pour TOUS les items qui ont
      // changé de position. Filtre les inchangés pour minimiser les writes.
      const updates = reordered
        .map((it, i) => ({ id: it.id, sort_order: i + 1, prev: it.sort_order }))
        .filter(u => u.prev !== u.sort_order)
      const results = await Promise.all(
        updates.map(u =>
          supabase.from('shop_items').update({ sort_order: u.sort_order }).eq('id', u.id)
        )
      )
      const firstError = results.find(r => r.error)?.error
      if (firstError) throw firstError
      await load()
    } catch (err) {
      alert(`Erreur de tri : ${err.message}`)
      await load() // resync DB en cas d'échec
    } finally {
      setSavingId(null)
    }
  }

  // Réordonner : swap du sort_order entre l'item et son voisin (haut ou bas).
  // Marche même si les sort_order ont des trous (1, 3, 7…) : on échange juste
  // les deux valeurs existantes au lieu de réécrire toute la séquence.
  const handleMove = async (item, direction) => {
    const idx = items.findIndex(i => i.id === item.id)
    if (idx === -1) return
    const neighborIdx = direction === 'up' ? idx - 1 : idx + 1
    if (neighborIdx < 0 || neighborIdx >= items.length) return
    const neighbor = items[neighborIdx]

    // Optimistic UI : on swap localement avant le round-trip réseau
    setItems(prev => {
      const next = [...prev]
      next[idx] = neighbor
      next[neighborIdx] = item
      return next
    })

    setSavingId(item.id)
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('shop_items').update({ sort_order: neighbor.sort_order }).eq('id', item.id),
        supabase.from('shop_items').update({ sort_order: item.sort_order }).eq('id', neighbor.id),
      ])
      if (e1 || e2) throw (e1 || e2)
      await load()
    } catch (err) {
      alert(`Erreur de tri : ${err.message}`)
      await load() // resync depuis la DB en cas d'échec
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
        {items.map((item, idx) => {
          const isPack = item.type === 'pack'
          const mediaUrl = item.media_url || item.animation_url
          const isVideo = item.media_type === 'mp4' || /\.(mp4|webm)($|\?)/i.test(mediaUrl || '')
          const saving = savingId === item.id
          const isFirst = idx === 0
          const isLast  = idx === items.length - 1

          return (
            <div key={item.id} className={`emote-admin-row ${isPack ? 'is-pack' : ''} ${!item.is_visible ? 'is-hidden' : ''}`}>
              {/* Reorder : flèches pour décaler d'un cran + input pour
                  taper directement la position cible (1..N) puis Enter/blur.
                  Le `key` lié à idx force le re-mount du champ quand la
                  position change, pour resynchroniser defaultValue. */}
              <div className="emote-admin-reorder">
                <button
                  type="button"
                  className="emote-admin-reorder-btn"
                  onClick={() => handleMove(item, 'up')}
                  disabled={isFirst || saving}
                  title="Monter"
                  aria-label="Monter"
                >▲</button>
                <input
                  key={`pos-${item.id}-${idx}`}
                  type="number"
                  min={1}
                  max={items.length}
                  defaultValue={idx + 1}
                  className="emote-admin-reorder-pos-input"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      e.currentTarget.value = String(idx + 1)
                      e.currentTarget.blur()
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (Number.isInteger(v) && v !== idx + 1) handleSetPosition(item, v)
                  }}
                  title={`Position actuelle : ${idx + 1}. Tape un numéro (1-${items.length}) + Entrée pour repositionner.`}
                  aria-label={`Position (actuellement ${idx + 1}, sur ${items.length})`}
                />
                <button
                  type="button"
                  className="emote-admin-reorder-btn"
                  onClick={() => handleMove(item, 'down')}
                  disabled={isLast || saving}
                  title="Descendre"
                  aria-label="Descendre"
                >▼</button>
              </div>

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
                      <span className="emote-admin-label">
                        Visuel (GIF / PNG / WebP / MP4 — max 20 Mo)
                        <em style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                          — les vidéos passent par un trim 5s + compression auto
                        </em>
                      </span>
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
                            e.target.value = ''
                            if (!f) return
                            // Vidéo → passage par le trimmer/compresseur avant upload
                            if (isVideoFile(f)) {
                              if (f.size > MAX_MEDIA_SIZE) {
                                alert(`Vidéo trop volumineuse. Max : ${MAX_MEDIA_SIZE / (1024 * 1024)} Mo`)
                                return
                              }
                              setTrimmer({ item, file: f })
                            } else {
                              handleUpload(item, f, 'media')
                            }
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

      {/* Modal trim/compression vidéo */}
      {trimmer && (
        <VideoTrimmer
          file={trimmer.file}
          onConfirm={(compressedFile, trimmerOpts) => {
            const ctx = trimmer
            setTrimmer(null)
            handleUpload(ctx.item, compressedFile, 'media', trimmerOpts)
          }}
          onCancel={() => setTrimmer(null)}
        />
      )}
    </div>
  )
}
