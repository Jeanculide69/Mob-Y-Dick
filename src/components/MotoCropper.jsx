import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

// Rectangle 3:2 paysage — idéal pour une photo de moto
// Output : 900 × 600 px en WebP (JPEG fallback) → ~80-180 Ko selon la photo
const OUTPUT_W = 900
const OUTPUT_H = 600
const OUTPUT_QUALITY = 0.82
const ASPECT = OUTPUT_W / OUTPUT_H // 1.5

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })

const canvasSupportsWebp = (() => {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
  } catch {
    return false
  }
})()

export default function MotoCropper({ imageSrc, onCancel, onConfirm }) {
  const [crop, setCrop]                     = useState({ x: 0, y: 0 })
  const [zoom, setZoom]                     = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [processing, setProcessing]         = useState(false)
  const [error, setError]                   = useState(null)

  const onCropComplete = useCallback((_area, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    setError(null)
    try {
      const image = await loadImage(imageSrc)
      const canvas = document.createElement('canvas')
      canvas.width  = OUTPUT_W
      canvas.height = OUTPUT_H
      const ctx = canvas.getContext('2d', { alpha: false })

      // Fond sombre pour les PNG transparents
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H)

      // Dessine la zone recadrée en la redimensionnant à la taille de sortie
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0, 0,
        OUTPUT_W, OUTPUT_H
      )

      const mimeType = canvasSupportsWebp ? 'image/webp' : 'image/jpeg'
      const ext      = canvasSupportsWebp ? 'webp'       : 'jpg'

      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Conversion échouée'))),
          mimeType,
          OUTPUT_QUALITY
        )
      )

      await onConfirm(blob, ext)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erreur lors du traitement de l\'image')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="moto-cropper-overlay" onClick={onCancel}>
      <div
        className="moto-cropper-shell glass"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moto-cropper-title"
      >
        {/* Header */}
        <div className="moto-cropper-header">
          <h3 id="moto-cropper-title">📷 Recadrer la photo</h3>
          <button
            type="button"
            className="moto-cropper-close"
            onClick={onCancel}
            aria-label="Annuler"
          >✕</button>
        </div>

        {/* Zone de recadrage */}
        <div className="moto-cropper-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT}
            cropShape="rect"
            showGrid={true}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            restrictPosition={false}
            style={{
              containerStyle: { background: '#050505' },
              cropAreaStyle: {
                border: '2px solid #ff5500',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
              },
            }}
          />
        </div>

        {/* Contrôles */}
        <div className="moto-cropper-controls">
          <label className="moto-cropper-zoom-label">
            <span>🔍 Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="moto-cropper-slider"
            />
          </label>
          <p className="moto-cropper-hint">
            Déplace et zoome pour cadrer ta moto. La photo sera rognée en <strong>3:2 paysage</strong> et compressée automatiquement.
          </p>
        </div>

        {/* Taille de sortie indicative */}
        <div className="moto-cropper-info">
          <span>📐 {OUTPUT_W} × {OUTPUT_H} px</span>
          <span>⚖️ ~100–180 Ko</span>
          <span>{canvasSupportsWebp ? '🖼️ WebP' : '📷 JPEG'}</span>
        </div>

        {error && <div className="moto-cropper-error">⚠️ {error}</div>}

        {/* Actions */}
        <div className="moto-cropper-actions">
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
            {processing ? '⏳ Compression...' : '✓ Valider la photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
