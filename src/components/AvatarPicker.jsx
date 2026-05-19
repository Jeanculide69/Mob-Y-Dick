import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'

// 10 dicebear styles. Each user sees the same seed across all styles so the
// preview reflects an avatar that already feels "theirs" — and the visual
// distinction comes from the style, not the seed.
const DICEBEAR_STYLES = [
  'avataaars',
  'adventurer',
  'bottts',
  'big-smile',
  'croodles',
  'fun-emoji',
  'lorelei',
  'miniavs',
  'notionists',
  'pixel-art',
]

const buildDicebearUrl = (style, seed) =>
  `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`

export default function AvatarPicker({ session, profile, onUpdated }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Use the email or display_name as seed so the same person gets a recognizable
  // recurring avatar across styles.
  const seed = profile?.display_name || session?.user?.email || session?.user?.id || 'rider'
  const currentAvatar = profile?.avatar_url

  const setAvatarUrl = async (url) => {
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', session.user.id)
      if (error) throw error
      if (onUpdated) onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image trop lourde (max 2 Mo).')
      return
    }

    setUploading(true)
    setError(null)
    try {
      // Path convention: <user_id>/<timestamp>.<ext> — the RLS policy enforces
      // that users can only write under their own UUID folder.
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Add a cache-busting query so the new avatar shows up immediately
      // (browsers and the existing <img> tags will refetch).
      await setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-picker-current">
        <img
          src={currentAvatar || buildDicebearUrl('avataaars', seed)}
          alt="Avatar actuel"
          className="avatar-picker-preview"
        />
        <div className="avatar-picker-current-info">
          <strong>Avatar actuel</strong>
          <span>Cet avatar apparaît dans le chat, les commentaires et ton profil.</span>
        </div>
      </div>

      {error && <div className="avatar-picker-error">⚠️ {error}</div>}

      <div className="avatar-picker-section">
        <h4>📷 Importer une photo</h4>
        <p className="avatar-picker-hint">JPG, PNG, WebP ou GIF — max 2 Mo</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={uploading || saving}
          className="avatar-picker-file-input"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || saving}
        >
          {uploading ? 'Envoi en cours...' : '📤 Choisir un fichier'}
        </button>
      </div>

      <div className="avatar-picker-section">
        <h4>🎨 Ou choisis un avatar</h4>
        <p className="avatar-picker-hint">10 styles uniques générés pour toi</p>
        <div className="avatar-picker-grid">
          {DICEBEAR_STYLES.map(style => {
            const url = buildDicebearUrl(style, seed)
            const isSelected = currentAvatar === url
            return (
              <button
                key={style}
                type="button"
                className={`avatar-picker-option ${isSelected ? 'selected' : ''}`}
                onClick={() => setAvatarUrl(url)}
                disabled={saving || uploading}
                title={style}
              >
                <img src={url} alt={style} />
                {isSelected && <span className="avatar-picker-check">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
