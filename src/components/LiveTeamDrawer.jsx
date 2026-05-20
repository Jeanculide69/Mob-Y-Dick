/**
 * LiveTeamDrawer — Panneau détail d'une équipe pendant la course live
 * Desktop : panneau lateral 520px | Mobile : bottom sheet 88dvh
 */
import { useMemo, useEffect } from 'react'
import './LiveTeamDrawer.css'

// ── SVG chart ────────────────────────────────────────────
const W   = 600, H = 200
const PAD = { left: 56, right: 18, top: 16, bottom: 40 }
const IW  = W - PAD.left - PAD.right
const IH  = H - PAD.top  - PAD.bottom

// Format court pour l'axe Y du graphique : "25.4s"
const fmtY = (ms) => {
  if (ms == null) return ''
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(1)
  return `${m}m${s}s`
}

// Format complet M:SS.mmm pour les stats
const fmt = (ms) => {
  if (ms == null) return '--:--.---'
  const m   = Math.floor(ms / 60000)
  const s   = Math.floor((ms % 60000) / 1000)
  const ms3 = ms % 1000
  return `${m}:${s.toString().padStart(2,'0')}.${ms3.toString().padStart(3,'0')}`
}

const fmtDiff = (ms) => {
  const s = (Math.abs(ms) / 1000).toFixed(3)
  return ms <= 0 ? `−${s}s` : `+${s}s`
}

const toX = (i, n) => n <= 1 ? PAD.left + IW / 2 : PAD.left + (i / (n - 1)) * IW
const toY = (v, lo, hi) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * IH

const GOLD   = '#ffd700'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const ORANGE = '#ff5500'

const dotColor = (ms, i, best, splits) => {
  if (ms === best) return GOLD
  if (i === 0)     return ORANGE
  return ms < splits[i - 1] ? GREEN : RED
}
const segColor = (a, b) => b < a ? GREEN : RED

// ── Composant ────────────────────────────────────────────
export default function LiveTeamDrawer({ team, allLaps, position, onClose }) {
  const { splits } = useMemo(() => {
    const tl = allLaps
      .filter(l => l.team_id === team.id)
      .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
    const sp = tl.map((l, i) => i === 0 ? l.lap_time_ms : l.lap_time_ms - tl[i - 1].lap_time_ms)
    return { splits: sp }
  }, [allLaps, team.id])

  const best = splits.length ? Math.min(...splits) : null
  const last = splits.length ? splits[splits.length - 1] : null
  const avg  = splits.length ? Math.round(splits.reduce((a, b) => a + b, 0) / splits.length) : null
  const lo   = best
  const hi   = splits.length ? Math.max(...splits) : null

  // Espacement des labels X
  const stepX = splits.length <= 10 ? 1
               : splits.length <= 25 ? 2
               : splits.length <= 50 ? 5 : 10

  // Tendance (dernier tour vs moyen)
  const lastTrend = last != null && avg != null
    ? (last < avg ? 'fast' : last > avg ? 'slow' : 'neutral')
    : 'neutral'

  // Verrouille le scroll de la page derrière tant que le drawer est ouvert
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Le bouton "retour" du téléphone ferme le drawer au lieu de quitter le site.
  // On empile un état dans l'historique à l'ouverture, on écoute popstate pour
  // appeler onClose, et on resynchronise l'historique si la fermeture vient
  // de la croix (et pas du back natif).
  //
  // ⚠️ Deps vide volontaire : si on dépend de onClose (qui change à chaque
  // render du parent), le cleanup tire history.back() en boucle et le drawer
  // se referme aussitôt après son ouverture.
  useEffect(() => {
    let closedByBack = false
    window.history.pushState({ mydDrawer: true }, '')
    const onPop = () => {
      closedByBack = true
      onClose()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!closedByBack) {
        window.history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="ltd-backdrop" onClick={onClose} />

      <div className="ltd-panel glass" role="dialog" aria-modal="true" aria-label={`Stats ${team.pilot_1_name}`}>

        {/* ─── Header ─── */}
        <div className="ltd-header">
          <div className="ltd-header-left">
            <span className="ltd-pos">P{position}</span>
            <span className="ltd-num">#{team.moto_number}</span>
            <div className="ltd-pilots">
              <span className="ltd-pilot1">{team.pilot_1_name}</span>
              {team.pilot_2_name && <span className="ltd-pilot2">& {team.pilot_2_name}</span>}
            </div>
          </div>
          <div className="ltd-header-right">
            {team.category && <span className="ltd-cat">{team.category}</span>}
            <button className="ltd-close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </div>

        {/* ─── Stats ─── */}
        <div className="ltd-stats">
          <div className="ltd-stat">
            <span className="ltd-sv">{splits.length}</span>
            <span className="ltd-sl">Tours</span>
          </div>
          <div className="ltd-stat ltd-stat--gold">
            <span className="ltd-sv ltd-sv--gold">⚡ {fmt(best)}</span>
            <span className="ltd-sl">Meilleur</span>
          </div>
          <div className={`ltd-stat ltd-stat--${lastTrend}`}>
            <span className={`ltd-sv ltd-sv--${lastTrend}`}>{fmt(last)}</span>
            <span className="ltd-sl">Dernier</span>
          </div>
          <div className="ltd-stat">
            <span className="ltd-sv">{fmt(avg)}</span>
            <span className="ltd-sl">Moyenne</span>
          </div>
        </div>

        {/* ─── Graphique ─── */}
        <div className="ltd-chart-block">
          <div className="ltd-chart-header">
            <span className="ltd-chart-label">⏱ Évolution temps au tour</span>
            <span className="ltd-chart-sub">Bas&thinsp;=&thinsp;plus rapide</span>
          </div>

          {splits.length < 2 ? (
            <div className="ltd-empty">
              {splits.length === 0 ? '🏁 Aucun tour' : '⏳ En attente du 2ᵉ passage…'}
            </div>
          ) : (
            <div className="ltd-chart-wrap">
              <svg viewBox={`0 0 ${W} ${H}`} className="ltd-svg" aria-hidden="true">
                <defs>
                  <linearGradient id="ltGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#ff5500" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#ff5500" stopOpacity="0"    />
                  </linearGradient>
                </defs>

                {/* Grille H */}
                {[0, .25, .5, .75, 1].map((t, gi) => {
                  const v = lo + (hi - lo) * t
                  const y = toY(v, lo, hi)
                  return (
                    <g key={gi}>
                      <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                        stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 4" />
                      <text x={PAD.left - 4} y={y + 4}
                        textAnchor="end" fill="rgba(255,255,255,0.32)"
                        fontSize="11" fontFamily="inherit">
                        {fmtY(Math.round(v))}
                      </text>
                    </g>
                  )
                })}

                {/* Ligne best (jaune) */}
                <line x1={PAD.left} y1={toY(best, lo, hi)}
                      x2={W - PAD.right} y2={toY(best, lo, hi)}
                  stroke="rgba(255,215,0,0.35)" strokeWidth="1.5" strokeDasharray="5 3" />

                {/* Ligne moyenne (gris) */}
                {avg != null && (
                  <line x1={PAD.left} y1={toY(avg, lo, hi)}
                        x2={W - PAD.right} y2={toY(avg, lo, hi)}
                    stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="6 3" />
                )}

                {/* Aire */}
                {(() => {
                  const cs = splits.map((v, i) => ({ x: toX(i, splits.length), y: toY(v, lo, hi) }))
                  const d = [`M ${cs[0].x} ${PAD.top + IH}`, ...cs.map(c => `L ${c.x} ${c.y}`),
                             `L ${cs[cs.length-1].x} ${PAD.top + IH}`, 'Z'].join(' ')
                  return <path d={d} fill="url(#ltGrad)" />
                })()}

                {/* Segments colorés */}
                {splits.map((v, i) => {
                  if (i === 0) return null
                  return <line key={i}
                    x1={toX(i-1, splits.length)} y1={toY(splits[i-1], lo, hi)}
                    x2={toX(i,   splits.length)} y2={toY(v, lo, hi)}
                    stroke={segColor(splits[i-1], v)} strokeWidth="2.5" strokeLinecap="round" />
                })}

                {/* Points */}
                {splits.map((v, i) => {
                  const isBest = v === best
                  const col = dotColor(v, i, best, splits)
                  return <circle key={i}
                    cx={toX(i, splits.length)} cy={toY(v, lo, hi)}
                    r={isBest ? 6 : 3.5}
                    fill={col}
                    stroke={isBest ? '#fff' : 'rgba(0,0,0,0.4)'}
                    strokeWidth={isBest ? 1.5 : 0.8} />
                })}

                {/* Labels T1, T2… */}
                {splits.map((_, i) => {
                  const show = i % stepX === 0 || i === splits.length - 1
                  if (!show) return null
                  return <text key={i}
                    x={toX(i, splits.length)} y={H - PAD.bottom + 15}
                    textAnchor="middle" fill="rgba(255,255,255,0.33)"
                    fontSize="11" fontFamily="inherit">
                    T{i + 1}
                  </text>
                })}
              </svg>

              <div className="ltd-legend">
                <span style={{color: GREEN}}>● Gain</span>
                <span style={{color: RED}}>● Perte</span>
                <span style={{color: GOLD}}>● Meilleur</span>
                <span style={{color:'rgba(255,255,255,0.4)'}}>- - Moy.</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Liste des tours ─── */}
        {splits.length > 0 && (
          <div className="ltd-laps-block">
            <p className="ltd-laps-title">Détail par tour</p>
            <div className="ltd-laps">
              {[...splits].reverse().map((ms, ri) => {
                const i      = splits.length - 1 - ri
                const isBest = ms === best
                const diff   = i > 0 ? ms - splits[i - 1] : null
                return (
                  <div key={i} className={`ltd-lap${isBest ? ' ltd-lap--best' : ''}`}>
                    <span className="ltd-ln">T{i + 1}</span>
                    <span className={`ltd-lt${isBest ? ' ltd-lt--gold' : ''}`}>
                      {fmt(ms)}{isBest ? ' ⚡' : ''}
                    </span>
                    {diff != null && (
                      <span className={`ltd-ld${diff <= 0 ? ' ltd-ld--fast' : ' ltd-ld--slow'}`}>
                        {fmtDiff(diff)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
