import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

// Renders the user-selected file inside a crop area with drag + zoom
// controls. On confirm, runs the crop in a canvas and returns a WebP/JPEG Blob
// downscaled to outputWidth × outputHeight — that's what eventually goes to
// Supabase Storage, never the original file.
//
// Props (toutes optionnelles, défauts = avatar carré 512px) :
//  - aspect       : ratio largeur/hauteur de la zone de crop (1 = carré)
//  - outputWidth  : largeur en px du blob de sortie
//  - outputHeight : hauteur en px du blob de sortie
//  - cropShape    : 'round' | 'rect'
//  - title        : titre de la modale
//  - hint         : phrase d'aide affichée
const DEFAULT_OUTPUT_SIZE = 512
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

export default function AvatarCropper({
  imageSrc,
  onCancel,
  onConfirm,
  aspect = 1,
  outputWidth,
  outputHeight,
  cropShape = 'round',
  title = '✂️ Recadrer ton avatar',
  hint = 'Pince ou utilise la molette pour zoomer, glisse pour positionner ton visage au centre.',
  backgroundFill = '#1a1a2e',
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  // Calcule la taille de sortie depuis aspect + outputWidth/Height
  const finalW = outputWidth || DEFAULT_OUTPUT_SIZE
  const finalH = outputHeight || (outputWidth ? Math.round(outputWidth / aspect) : DEFAULT_OUTPUT_SIZE)

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
      canvas.width = finalW
      canvas.height = finalH
      const transparent = !backgroundFill || backgroundFill === 'transparent'
      const ctx = canvas.getContext('2d', { alpha: transparent })

      if (!transparent) {
        // Fill bg pour éviter les coins noirs en JPEG quand on re-encode un PNG
        ctx.fillStyle = backgroundFill
        ctx.fillRect(0, 0, finalW, finalH)
      }
      // Si transparent, on garde l'alpha (PNG transparent → WebP transparent)

      // Draw the cropped region scaled to the output size
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        finalW,
        finalH
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
          <h3 id="cropper-title">{title}</h3>
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
            minZoom={0.5}
            aspect={aspect}
            cropShape={cropShape}
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
              min={0.5}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="avatar-cropper-slider"
            />
          </label>
          <p className="avatar-cropper-hint">{hint}</p>
          <p className="avatar-cropper-output-info">
            Sortie : {finalW}×{finalH}px · WebP/JPEG ~85%
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
