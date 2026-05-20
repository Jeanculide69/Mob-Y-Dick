/**
 * LiveTeamDrawer — Panneau détail d'une équipe pendant la course live
 * Glisse depuis la droite (desktop) ou du bas (mobile)
 * Courbe SVG pure, temps au tour colorés : vert = plus rapide, rouge = plus lent
 */
import { useMemo } from 'react'
import './LiveTeamDrawer.css'

// ── SVG dimensions ──────────────────────────────────────
const W = 520, H = 190
const PAD = { left: 74, right: 14, top: 16, bottom: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

const formatTime = (ms) => {
  if (ms == null) return '--:--.---'
  const m   = Math.floor(ms / 60000)
  const s   = Math.floor((ms % 60000) / 1000)
  const ms3 = ms % 1000
  return `${m}:${s.toString().padStart(2,'0')}.${ms3.toString().padStart(3,'0')}`
}

const formatDiff = (ms) => {
  const abs = Math.abs(ms)
  const s = (abs / 1000).toFixed(3)
  return ms <= 0 ? `-${s}s` : `+${s}s`
}

const toX = (i, n) => n <= 1 ? PAD.left + IW / 2 : PAD.left + (i / (n - 1)) * IW
// min → bottom (fastest), max → top (slowest)  — convention chrono standard
const toY = (val, min, max) => PAD.top + (1 - (val - min) / (max - min || 1)) * IH

const DOT_GOLD   = '#ffd700'
const DOT_GREEN  = '#22c55e'
const DOT_RED    = '#ef4444'
const DOT_ORANGE = '#ff5500'

function dotColor(ms, idx, best, splits) {
  if (ms === best)    return DOT_GOLD
  if (idx === 0)      return DOT_ORANGE
  return ms < splits[idx - 1] ? DOT_GREEN : DOT_RED
}
function segColor(prev, next) {
  return next < prev ? DOT_GREEN : DOT_RED
}

// ── Composant principal ─────────────────────────────────
export default function LiveTeamDrawer({ team, allLaps, position, onClose }) {
  // Calcul des splits (durées individuelles par tour)
  const { splits } = useMemo(() => {
    const tl = allLaps
      .filter(l => l.team_id === team.id)
      .sort((a, b) => a.lap_time_ms - b.lap_time_ms)
    const sp = tl.map((lap, i) =>
      i === 0 ? lap.lap_time_ms : lap.lap_time_ms - tl[i - 1].lap_time_ms
    )
    return { splits: sp }
  }, [allLaps, team.id])

  const best = splits.length ? Math.min(...splits) : null
  const last = splits.length ? splits[splits.length - 1] : null
  const avg  = splits.length
    ? Math.round(splits.reduce((a, b) => a + b, 0) / splits.length)
    : null

  const minV = best
  const maxV = splits.length ? Math.max(...splits) : null

  // Nb de labels X à afficher selon densité
  const stepX = splits.length <= 10 ? 1 : splits.length <= 20 ? 2 : splits.length <= 40 ? 5 : 10

  return (
    <>
      {/* Fond semi-transparent (ferme au clic) */}
      <div className="ltd-backdrop" onClick={onClose} />

      {/* Panneau glissant */}
      <div className="ltd-panel glass" role="dialog" aria-modal="true">

        {/* ── Header ── */}
        <div className="ltd-header">
          <div className="ltd-header-left">
            <span className="ltd-pos">P{position}</span>
            <span className="ltd-num">#{team.moto_number}</span>
            <div className="ltd-pilots">
              <span className="ltd-pilot1">{team.pilot_1_name}</span>
              {team.pilot_2_name && (
                <span className="ltd-pilot2">& {team.pilot_2_name}</span>
              )}
            </div>
          </div>
          {team.category && (
            <span className="ltd-cat-badge">{team.category}</span>
          )}
          <button className="ltd-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {/* ── Mini stats ── */}
        <div className="ltd-stats-row">
          <div className="ltd-stat">
            <span className="ltd-stat-val">{splits.length}</span>
            <span className="ltd-stat-lbl">Tours</span>
          </div>
          <div className="ltd-stat">
            <span className="ltd-stat-val ltd-val-gold">{formatTime(best)}</span>
            <span className="ltd-stat-lbl">⚡ Meilleur</span>
          </div>
          <div className="ltd-stat">
            <span className={`ltd-stat-val ${last != null && avg != null ? (last < avg ? 'ltd-val-green' : 'ltd-val-red') : ''}`}>
              {formatTime(last)}
            </span>
            <span className="ltd-stat-lbl">Dernier</span>
          </div>
          <div className="ltd-stat">
            <span className="ltd-stat-val">{formatTime(avg)}</span>
            <span className="ltd-stat-lbl">Moyenne</span>
          </div>
        </div>

        {/* ── Courbe ── */}
        <div className="ltd-chart-section">
          <div className="ltd-chart-section-title">
            ⏱ Évolution des temps au tour
            <span className="ltd-chart-hint">Bas = plus rapide</span>
          </div>

          {splits.length < 2 ? (
            <div className="ltd-chart-empty">
              {splits.length === 0
                ? '🏁 Aucun tour enregistré'
                : '⏳ En attente du 2ème passage...'}
            </div>
          ) : (
            <div className="ltd-chart-wrap">
              <svg viewBox={`0 0 ${W} ${H}`} className="ltd-chart-svg">
                <defs>
                  <linearGradient id="ltdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#ff5500" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ff5500" stopOpacity="0"    />
                  </linearGradient>
                  <linearGradient id="ltdGradBest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#ffd700" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ffd700" stopOpacity="0"    />
                  </linearGradient>
                </defs>

                {/* Grille horizontale */}
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const v = minV + (maxV - minV) * t
                  const y = toY(v, minV, maxV)
                  return (
                    <g key={i}>
                      <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                        stroke="rgba(255,255,255,0.055)" strokeWidth="1" strokeDasharray="4 4" />
                      <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                        fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="inherit">
                        {formatTime(Math.round(v))}
                      </text>
                    </g>
                  )
                })}

                {/* Ligne meilleur tour (jaune pointillé) */}
                {best != null && (
                  <>
                    <line
                      x1={PAD.left} y1={toY(best, minV, maxV)}
                      x2={W - PAD.right} y2={toY(best, minV, maxV)}
                      stroke="rgba(255,215,0,0.4)" strokeWidth="1.5" strokeDasharray="5 3"
                    />
                    <text x={W - PAD.right + 2} y={toY(best, minV, maxV) + 4}
                      fill="rgba(255,215,0,0.6)" fontSize="9" fontFamily="inherit">
                      ⚡
                    </text>
                  </>
                )}

                {/* Ligne moyenne (gris pointillé) */}
                {avg != null && (
                  <line
                    x1={PAD.left} y1={toY(avg, minV, maxV)}
                    x2={W - PAD.right} y2={toY(avg, minV, maxV)}
                    stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="6 3"
                  />
                )}

                {/* Aire sous la courbe */}
                {(() => {
                  const coords = splits.map((v, i) => ({
                    x: toX(i, splits.length),
                    y: toY(v, minV, maxV),
                  }))
                  const d = [
                    `M ${coords[0].x} ${PAD.top + IH}`,
                    ...coords.map(c => `L ${c.x} ${c.y}`),
                    `L ${coords[coords.length - 1].x} ${PAD.top + IH}`,
                    'Z',
                  ].join(' ')
                  return <path d={d} fill="url(#ltdGrad)" />
                })()}

                {/* Segments colorés */}
                {splits.map((v, i) => {
                  if (i === 0) return null
                  return (
                    <line key={i}
                      x1={toX(i - 1, splits.length)} y1={toY(splits[i - 1], minV, maxV)}
                      x2={toX(i, splits.length)}     y2={toY(v, minV, maxV)}
                      stroke={segColor(splits[i - 1], v)}
                      strokeWidth="2.5" strokeLinecap="round"
                    />
                  )
                })}

                {/* Points */}
                {splits.map((v, i) => {
                  const isBest = v === best
                  const color  = dotColor(v, i, best, splits)
                  return (
                    <circle key={i}
                      cx={toX(i, splits.length)} cy={toY(v, minV, maxV)}
                      r={isBest ? 6 : 3.5}
                      fill={color}
                      stroke={isBest ? '#fff' : 'rgba(0,0,0,0.5)'}
                      strokeWidth={isBest ? 1.5 : 0.8}
                    />
                  )
                })}

                {/* Labels X (numéros de tours) */}
                {splits.map((_, i) => {
                  const show = i % stepX === 0 || i === splits.length - 1
                  if (!show) return null
                  return (
                    <text key={i}
                      x={toX(i, splits.length)} y={H - PAD.bottom + 16}
                      textAnchor="middle" fill="rgba(255,255,255,0.33)"
                      fontSize="10" fontFamily="inherit">
                      T{i + 1}
                    </text>
                  )
                })}
              </svg>

              {/* Légende */}
              <div className="ltd-legend">
                <span className="ltd-legend-item" style={{ color: DOT_GREEN }}>● Gain</span>
                <span className="ltd-legend-item" style={{ color: DOT_RED }}>● Perte</span>
                <span className="ltd-legend-item" style={{ color: DOT_GOLD }}>● Meilleur</span>
                <span className="ltd-legend-item" style={{ color: 'rgba(255,255,255,0.35)' }}>- - Moy.</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Liste des tours ── */}
        {splits.length > 0 && (
          <div className="ltd-lap-list">
            <div className="ltd-lap-list-title">Détail par tour</div>
            <div className="ltd-laps">
              {[...splits].reverse().map((ms, revIdx) => {
                const i    = splits.length - 1 - revIdx
                const isBest = ms === best
                const diff = i > 0 ? ms - splits[i - 1] : null
                return (
                  <div key={i} className={`ltd-lap-row${isBest ? ' ltd-lap-row--best' : ''}`}>
                    <span className="ltd-lap-n">T{i + 1}</span>
                    <span className={`ltd-lap-t${isBest ? ' ltd-lap-t--gold' : ''}`}>
                      {formatTime(ms)}{isBest ? ' ⚡' : ''}
                    </span>
                    {diff != null && (
                      <span className={`ltd-lap-d${diff <= 0 ? ' ltd-lap-d--fast' : ' ltd-lap-d--slow'}`}>
                        {formatDiff(diff)}
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
