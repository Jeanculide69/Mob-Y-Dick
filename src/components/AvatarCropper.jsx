import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

// Renders the user-selected file inside a square crop area with drag + zoom
// controls. On confirm, runs the crop in a canvas and returns a WebP/JPEG Blob
// downscaled to AVATAR_OUTPUT_SIZE — that's what eventually goes to Supabase
// Storage, never the original file.
const AVATAR_OUTPUT_SIZE = 512 // pixels (square)
const OUTPUT_QUALITY = 0.85

// Load an image from a data URL into an <img> for canvas drawing.
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = (err) => reject(err)
  img.src = src
})

// Detect WebP encoding support once (Safari < 14 falls back to JPEG).
const canvasSupportsWebp = (() => {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
  } catch {
    return false
  }
})()

export default function AvatarCropper({ imageSrc, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    setError(null)
    try {
      const image = await loadImage(imageSrc)
      const canvas = document.createElement('canvas')
      canvas.width = AVATAR_OUTPUT_SIZE
      canvas.height = AVATAR_OUTPUT_SIZE
      const ctx = canvas.getContext('2d', { alpha: false })

      // Fill bg so transparent PNGs don't end up with black corners when re-encoded as JPEG
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)

      // Draw the cropped region scaled to the output size
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        AVATAR_OUTPUT_SIZE,
        AVATAR_OUTPUT_SIZE
      )

      const mimeType = canvasSupportsWebp ? 'image/webp' : 'image/jpeg'
      const ext = canvasSupportsWebp ? 'webp' : 'jpg'
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Conversion image échouée'))),
          mimeType,
          OUTPUT_QUALITY
        )
      })

      await onConfirm(blob, ext)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erreur lors du traitement de l\'image')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="avatar-cropper-overlay" onClick={onCancel}>
      <div
        className="avatar-cropper glass"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-title"
      >
        <div className="avatar-cropper-header">
          <h3 id="cropper-title">✂️ Recadrer ton avatar</h3>
          <button
            type="button"
            className="avatar-cropper-close"
            onClick={onCancel}
            aria-label="Annuler"
          >
            ✕
          </button>
        </div>

        <div className="avatar-cropper-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="cover"
            restrictPosition={false}
          />
        </div>

        <div className="avatar-cropper-controls">
          <label className="avatar-cropper-zoom-label">
            <span>🔍 Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="avatar-cropper-slider"
            />
          </label>
          <p className="avatar-cropper-hint">
            Pince ou utilise la molette pour zoomer, glisse pour positionner ton visage au centre.
          </p>
        </div>

        {error && <div className="avatar-cropper-error">⚠️ {error}</div>}

        <div className="avatar-cropper-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={processing}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
          >
            {processing ? 'Traitement...' : '✓ Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
