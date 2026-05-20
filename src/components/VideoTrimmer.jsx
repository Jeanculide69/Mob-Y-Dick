/**
 * VideoTrimmer — Trim + compression côté navigateur (sans ffmpeg.wasm)
 *
 * Usage :
 *   <VideoTrimmer file={inputFile} onConfirm={blob => upload(blob)} onCancel={...} />
 *
 * Stratégie :
 *  - Charge la vidéo dans un <video> caché
 *  - L'utilisateur choisit un point de départ (max 5s seront capturées)
 *  - Au "Confirmer" : lecture de la vidéo, capture frame-by-frame sur un
 *    canvas 480×480 (contain mode, bordures noires), audio gardé via
 *    HTMLMediaElement.captureStream()
 *  - MediaRecorder encode en WebM (vp9/opus), bitrate ~1 Mbps vidéo + 96 kbps
 *    audio → ~700 KB pour 5 s en moyenne. Sortie ~uniforme pour tous les
 *    emotes vidéo du site.
 *
 *  Si la durée source est ≤ 5 s : on garde toute la vidéo sans slider.
 */
import { useEffect, useRef, useState } from 'react'
import './VideoTrimmer.css'

const TARGET_SIZE = 480           // Canvas carré 480×480
const TARGET_DURATION = 5         // Secondes max
const FPS = 30
const VIDEO_BITRATE = 1_000_000   // 1 Mbps
const AUDIO_BITRATE = 96_000      // 96 kbps

// Sélectionne le meilleur mimeType supporté par MediaRecorder du navigateur courant.
const pickMimeType = () => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  if (typeof MediaRecorder === 'undefined') return null
  return candidates.find(t => {
    try { return MediaRecorder.isTypeSupported(t) } catch { return false }
  }) || ''
}

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function VideoTrimmer({ file, onConfirm, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileUrlRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [previewTime, setPreviewTime] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  // Crée une URL objet pour la vidéo source
  useEffect(() => {
    if (!file) return
    fileUrlRef.current = URL.createObjectURL(file)
    if (videoRef.current) {
      videoRef.current.src = fileUrlRef.current
    }
    return () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    }
  }, [file])

  const handleLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    // Initialise au début
    v.currentTime = 0
    setStartTime(0)
    setPreviewTime(0)
  }

  const handleScrub = (e) => {
    const t = parseFloat(e.target.value)
    setStartTime(t)
    if (videoRef.current) {
      videoRef.current.currentTime = t
      setPreviewTime(t)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) setPreviewTime(videoRef.current.currentTime)
  }

  const captureDuration = Math.min(TARGET_DURATION, Math.max(0, duration - startTime))
  const maxStart = Math.max(0, duration - 0.5) // on autorise jusqu'à 0.5s avant la fin

  const handleConfirm = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const mimeType = pickMimeType()
    if (!mimeType) {
      setError('Ton navigateur ne supporte pas MediaRecorder. Utilise Chrome/Firefox récent.')
      return
    }

    setError('')
    setProcessing(true)
    setProgress(0)

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = TARGET_SIZE
    canvas.height = TARGET_SIZE
    const ctx = canvas.getContext('2d')

    try {
      // ── Préparer la vidéo ──
      video.muted = true   // pas d'audio audible pendant l'enregistrement
      video.currentTime = startTime
      await new Promise(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
        video.addEventListener('seeked', onSeeked)
      })

      // ── Construire le stream final (canvas vidéo + audio source) ──
      const canvasStream = canvas.captureStream(FPS)
      const finalStream = new MediaStream()
      canvasStream.getVideoTracks().forEach(t => finalStream.addTrack(t))

      try {
        const srcStream = typeof video.captureStream === 'function'
          ? video.captureStream()
          : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null)
        if (srcStream) {
          srcStream.getAudioTracks().forEach(t => finalStream.addTrack(t))
        }
      } catch {
        // Pas d'audio capturable : on continue avec la vidéo seule
      }

      const recorderOpts = {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE,
      }
      const recorder = new MediaRecorder(finalStream, recorderOpts)
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }

      const recordingDone = new Promise((resolve, reject) => {
        recorder.onstop = () => resolve()
        recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'))
      })

      // ── Lancer ──
      recorder.start(200)
      try { await video.play() } catch { /* autoplay may be blocked but seek+rAF works */ }

      const drawStart = performance.now()
      let stopped = false
      const stop = () => {
        if (stopped) return
        stopped = true
        try { recorder.stop() } catch { /* ignore */ }
        try { video.pause() } catch { /* ignore */ }
      }

      const drawFrame = () => {
        if (stopped) return
        const elapsed = (performance.now() - drawStart) / 1000
        if (elapsed >= captureDuration || video.ended) {
          // Capture une dernière frame puis stoppe
          drawCurrent()
          // petite marge pour laisser MediaRecorder flush
          setTimeout(stop, 80)
          return
        }
        drawCurrent()
        setProgress(Math.min(100, (elapsed / captureDuration) * 100))
        requestAnimationFrame(drawFrame)
      }

      const drawCurrent = () => {
        // Contain : on rentre la vidéo dans 480×480 avec bordures noires.
        const vw = video.videoWidth || TARGET_SIZE
        const vh = video.videoHeight || TARGET_SIZE
        const scale = Math.min(TARGET_SIZE / vw, TARGET_SIZE / vh)
        const dw = vw * scale
        const dh = vh * scale
        const dx = (TARGET_SIZE - dw) / 2
        const dy = (TARGET_SIZE - dh) / 2
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE)
        ctx.drawImage(video, dx, dy, dw, dh)
      }

      requestAnimationFrame(drawFrame)
      await recordingDone

      const ext = mimeType.startsWith('video/webm') ? 'webm' : 'mp4'
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
      const outFile = new File([blob], `emote-${Date.now()}.${ext}`, { type: blob.type })

      setProgress(100)
      setProcessing(false)
      onConfirm(outFile)
    } catch (err) {
      console.error(err)
      setError(`Compression échouée : ${err.message || err}`)
      setProcessing(false)
    }
  }

  return (
    <div className="video-trimmer-overlay" onClick={(e) => { if (e.target === e.currentTarget && !processing) onCancel() }}>
      <div className="video-trimmer glass">
        <div className="video-trimmer-header">
          <h3>✂️ Trim & Optimisation</h3>
          <button className="video-trimmer-close" onClick={onCancel} disabled={processing} aria-label="Fermer">✕</button>
        </div>

        <div className="video-trimmer-body">
          <p className="video-trimmer-hint">
            Choisis le passage de <strong>5 secondes max</strong> à utiliser.
            Le fichier sera resizé en <strong>480×480</strong>, compressé en WebM
            (~700 Ko) pour rester homogène avec les autres animations.
          </p>

          <div className="video-trimmer-preview">
            <video
              ref={videoRef}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              className="video-trimmer-video"
              playsInline
              controls={!processing}
            />
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {duration > 0 && (
            <div className="video-trimmer-controls">
              <div className="video-trimmer-times">
                <span>Début : <strong>{fmtTime(startTime)}</strong></span>
                <span>Durée capture : <strong>{captureDuration.toFixed(1)}s</strong></span>
                <span>Total source : {fmtTime(duration)}</span>
              </div>

              {duration > TARGET_DURATION && (
                <input
                  type="range"
                  min={0}
                  max={maxStart}
                  step={0.1}
                  value={startTime}
                  onChange={handleScrub}
                  disabled={processing}
                  className="video-trimmer-slider"
                />
              )}
            </div>
          )}

          {processing && (
            <div className="video-trimmer-progress">
              <div className="video-trimmer-progress-bar">
                <div className="video-trimmer-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>Compression en cours… {Math.round(progress)}%</span>
            </div>
          )}

          {error && <p className="video-trimmer-error">⚠️ {error}</p>}
        </div>

        <div className="video-trimmer-footer">
          <button className="btn btn-ghost" onClick={onCancel} disabled={processing}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={processing || duration === 0}
          >
            {processing ? '⏳ En cours…' : '✓ Compresser et utiliser'}
          </button>
        </div>
      </div>
    </div>
  )
}
