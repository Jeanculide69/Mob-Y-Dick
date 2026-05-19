import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import AvatarCropper from './AvatarCropper'

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

// Generous upper bound on the raw upload before crop — the cropper will resize
// to 512x512 WebP anyway (~50 KB final), so we mostly want to avoid loading a
// 50 MB DSLR shot into memory.
const MAX_RAW_FILE_SIZE = 15 * 1024 * 1024 // 15 MB

export default function AvatarPicker({ session, profile, onUpdated }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [cropperImage, setCropperImage] = useState(null)
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

  // Step 1: user selects a file → read it as a data URL → open the cropper.
  // Actual upload only happens after the user validates the crop.
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image.')
      return
    }
    if (file.size > MAX_RAW_FILE_SIZE) {
      setError('Image trop lourde à charger (max 15 Mo). Essaie une photo plus petite.')
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = () => setCropperImage(reader.result)
    reader.onerror = () => setError('Lecture du fichier impossible.')
    reader.readAsDataURL(file)

    // Reset input so picking the same file again re-triggers the change event
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Step 2: cropper returns a small WebP/JPEG Blob ready to upload.
  const handleCropConfirm = async (blob, ext) => {
    setUploading(true)
    setError(null)
    try {
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: blob.type,
        })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-busting query so the new avatar shows immediately in cached <img> tags.
      await setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
      setCropperImage(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
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
          <p className="avatar-picker-hint">
            Tu pourras recadrer et zoomer sur ton visage à l'étape suivante.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic"
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

      {cropperImage && (
        <AvatarCropper
          imageSrc={cropperImage}
          onCancel={() => setCropperImage(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  )
}
